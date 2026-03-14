import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getServiceController, buildPageConfig, cn } from '@/lib/utils';
import { NextPageWithConfig } from '@/pages/_app';
import { RemoteAppWindowAction } from '@/lib/enums';
import { RemoteAppWindowActionPayload } from 'shared/types';
import WindowFab from '@/components/windowFab';

/** Decode an HCMediaStream binary chunk into metadata + payload. */
function decodeMediaChunk(chunk: Uint8Array): { metadata: Record<string, string>; payload: Uint8Array } {
  const metaLen = (chunk[0] << 8) | chunk[1];
  const metaBytes = chunk.slice(2, 2 + metaLen);
  const payload = chunk.slice(2 + metaLen);
  const metadata: Record<string, string> = {};
  const metaStr = new TextDecoder().decode(metaBytes);
  if (metaStr.length > 0) {
    for (const line of metaStr.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) metadata[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return { metadata, payload };
}

/** Convert a mouse event on the (possibly CSS-scaled) canvas to native window coordinates. */
function canvasToWindowCoords(
  e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
  canvas: HTMLCanvasElement,
  dpi: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  // Canvas internal resolution is in pixels (dpi × logical),
  // but actions use logical (point) coordinates.
  const scaleX = (canvas.width / dpi) / rect.width;
  const scaleY = (canvas.height / dpi) / rect.height;
  return {
    x: Math.round(((e as MouseEvent).clientX - rect.left) * scaleX),
    y: Math.round(((e as MouseEvent).clientY - rect.top) * scaleY),
  };
}

function getModifiers(e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): string[] | undefined {
  const mods: string[] = [];
  if (e.shiftKey) mods.push('shift');
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('cmd');
  return mods.length > 0 ? mods : undefined;
}

const AppWindowPage: NextPageWithConfig = () => {
  const router = useRouter();
  const { windowId, fingerprint: fingerprintStr, title } = router.query as {
    windowId?: string;
    fingerprint?: string;
    title?: string;
  };
  const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const isMountedRef = useRef(true);
  const windowIdRef = useRef<string | undefined>(undefined);
  const fingerprintRef = useRef<string | null>(null);
  const dpiRef = useRef<number>(1);
  const resizingFromRemoteRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const hasFrameRef = useRef(false);

  windowIdRef.current = windowId;
  fingerprintRef.current = fingerprint;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // ── Action dispatch ──
  const dispatchAction = useCallback(
    async (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => {
      const wId = windowIdRef.current;
      if (!wId) return;
      try {
        const sc = await getServiceController(fingerprintRef.current);
        await sc.apps.performWindowAction({ ...payload, windowId: wId } as RemoteAppWindowActionPayload);
      } catch (e: any) {
        console.error('Action failed:', e);
      }
    },
    [],
  );

  // ── Resize sync ──
  useEffect(() => {
    const onResize = () => {
      if (resizingFromRemoteRef.current) return;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w > 0 && h > 0) {
          dispatchAction({ action: RemoteAppWindowAction.Resize, newWidth: w, newHeight: h });
        }
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [dispatchAction]);

  // ── H.264 stream consumer ──
  useEffect(() => {
    if (!windowId) return;
    setIsConnecting(true);
    setError(null);
    setHasFrame(false);
    hasFrameRef.current = false;

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let retryCount = 0;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    const MAX_RETRIES = 5;

    const cleanup = () => {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      if (reader) { reader.cancel().catch(() => {}); reader = null; }
      readerRef.current = null;
      if (decoderRef.current && decoderRef.current.state !== 'closed') {
        try { decoderRef.current.close(); } catch {}
      }
      decoderRef.current = null;
    };

    const startStream = async () => {
      cleanup(); // Clean up any previous decoder/reader before (re)starting
      console.log('[WindowStream] startStream called, windowId:', windowId, 'fingerprint:', fingerprintRef.current);

      try {
        console.log('[WindowStream] getting service controller...');
        const sc = await getServiceController(fingerprintRef.current);
        if (cancelled) { console.log('[WindowStream] cancelled after getServiceController'); return; }

        console.log('[WindowStream] calling startStreamingSession...');
        const session = await sc.apps.startStreamingSession(windowId);
        if (cancelled) { console.log('[WindowStream] cancelled after startStreamingSession'); return; }
        console.log('[WindowStream] session started:', { width: session.width, height: session.height, dpi: session.dpi, hasStream: !!session.stream });

        let currentWidth = session.width;
        let currentHeight = session.height;
        dpiRef.current = session.dpi || 1;

        // Resize BrowserWindow to logical size
        const logicalW = Math.round(session.width / dpiRef.current);
        const logicalH = Math.round(session.height / dpiRef.current);
        resizingFromRemoteRef.current = true;
        window.utils?.windowControls?.resize(logicalW, logicalH);
        setTimeout(() => { resizingFromRemoteRef.current = false; }, 200);

        // Set up canvas
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = session.width;
          canvas.height = session.height;
        }

        // Start heartbeat — keeps the server-side session alive
        heartbeatTimer = setInterval(() => {
          getServiceController(fingerprintRef.current)
            .then(sc => sc.apps.streamControl(windowId))
            .catch(() => {});
        }, 3000);

        // Set up VideoDecoder
        console.log('[WindowStream] setting up VideoDecoder...');
        const decoder = new VideoDecoder({
          output: (frame: VideoFrame) => {
            if (!isMountedRef.current) { frame.close(); return; }
            const c = canvasRef.current;
            if (c) {
              const ctx = c.getContext('2d');
              if (ctx) {
                if (c.width !== frame.displayWidth || c.height !== frame.displayHeight) {
                  c.width = frame.displayWidth;
                  c.height = frame.displayHeight;
                }
                ctx.drawImage(frame, 0, 0);
              }
            }
            frame.close();
            if (!hasFrameRef.current) {
              hasFrameRef.current = true;
              setHasFrame(true);
            }
            setIsConnecting(false);
          },
          error: (e: DOMException) => {
            console.error('[WindowStream] VideoDecoder error:', e?.message || e);
          },
        });
        decoderRef.current = decoder;
        console.log('[WindowStream] VideoDecoder created, state:', decoder.state);

        // Read the stream
        reader = session.stream.getReader();
        readerRef.current = reader;
        console.log('[WindowStream] stream reader created, starting read loop...');

        let codecConfigured = false;
        let frameCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled || !isMountedRef.current) {
            console.log('[WindowStream] read loop exit, done:', done, 'cancelled:', cancelled, 'mounted:', isMountedRef.current);
            break;
          }

          frameCount++;
          const { metadata, payload } = decodeMediaChunk(value);
          const isKeyframe = metadata.type === 'keyframe';

          if (frameCount <= 5 || frameCount % 60 === 0) {
            console.log(`[WindowStream] frame #${frameCount}: type=${metadata.type} payload=${payload.byteLength}B decoder=${decoder.state}`, metadata.width ? `${metadata.width}x${metadata.height}` : '');
          }

          if (metadata.dpi) dpiRef.current = Number(metadata.dpi);
          if (metadata.width && metadata.height) {
            const newW = Number(metadata.width);
            const newH = Number(metadata.height);

            // Only resize BrowserWindow + reconfigure decoder if dimensions actually changed
            if (newW !== currentWidth || newH !== currentHeight) {
              const logW = Math.round(newW / dpiRef.current);
              const logH = Math.round(newH / dpiRef.current);
              resizingFromRemoteRef.current = true;
              window.utils?.windowControls?.resize(logW, logH);
              setTimeout(() => { resizingFromRemoteRef.current = false; }, 200);

              currentWidth = newW;
              currentHeight = newH;

              // Reconfigure decoder for new dimensions
              if (isKeyframe) {
                decoder.configure({
                  codec: 'avc1.4D0032',
                  codedWidth: newW,
                  codedHeight: newH,
                  description: undefined,
                });
                codecConfigured = true;
              }
            }
          }

          if (isKeyframe && !codecConfigured) {
            decoder.configure({
              codec: 'avc1.4D0032',
              codedWidth: currentWidth,
              codedHeight: currentHeight,
              description: undefined,
            });
            codecConfigured = true;
          }

          if (!codecConfigured) continue;

          const chunk = new EncodedVideoChunk({
            type: isKeyframe ? 'key' : 'delta',
            timestamp: Number(metadata.ts || 0) * 1000,
            data: payload,
          });

          if (decoder.state === 'configured') {
            decoder.decode(chunk);
          }

          // Reset retry counter on successful frame
          retryCount = 0;
        }

        // Stream ended normally (done: true) — window may have closed
        if (!cancelled && isMountedRef.current) {
          console.log('[WindowStream] stream ended normally after', frameCount, 'frames');
          setError('Window stream ended.');
        }
      } catch (e: any) {
        if (cancelled || !isMountedRef.current) return;

        console.error('[WindowStream] Stream error:', e?.message || e, e?.stack);
        cleanup();

        // Auto-reconnect with backoff
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = 1000 + retryCount * 500;
          console.log(`Reconnecting (attempt ${retryCount}/${MAX_RETRIES}) in ${delay}ms...`);
          setIsConnecting(true);
          await new Promise(r => setTimeout(r, delay));
          if (!cancelled && isMountedRef.current) {
            startStream();
          }
        } else {
          setError('Connection lost. Could not reconnect.');
        }
      }
    };

    startStream();

    return () => {
      cancelled = true;
      cleanup();
      // Best-effort stop session on server
      getServiceController(fingerprintRef.current)
        .then(sc => sc.apps.stopStreamingSession(windowId!))
        .catch(() => {});
    };
  }, [windowId, dispatchAction]);

  // ── Mouse handlers ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || isDraggingRef.current) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);
      dispatchAction({ action: RemoteAppWindowAction.Click, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);
      dispatchAction({ action: RemoteAppWindowAction.DoubleClick, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);
      dispatchAction({ action: RemoteAppWindowAction.RightClick, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = false;
    window.focus();
    canvasRef.current?.focus();
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);

      if (e.buttons === 1) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          dispatchAction({ action: RemoteAppWindowAction.DragStart, x, y, modifiers: getModifiers(e) });
        } else {
          dispatchAction({ action: RemoteAppWindowAction.DragMove, x, y });
        }
        if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
        return;
      }

      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        dispatchAction({ action: RemoteAppWindowAction.Hover, x, y });
        hoverTimerRef.current = null;
      }, 500);
    },
    [dispatchAction],
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      if (isDraggingRef.current) {
        const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);
        dispatchAction({ action: RemoteAppWindowAction.DragEnd, x, y, modifiers: getModifiers(e) });
        setTimeout(() => { isDraggingRef.current = false; }, 0);
      }
    },
    [dispatchAction],
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current, dpiRef.current);
      const deltaX = Math.round(e.deltaX / 3);
      const deltaY = Math.round(e.deltaY / 3);
      if (deltaX === 0 && deltaY === 0) return;
      dispatchAction({ action: RemoteAppWindowAction.Scroll, x, y, scrollDeltaX: deltaX, scrollDeltaY: deltaY });
    },
    [dispatchAction],
  );

  const isCanvasVisible = useMemo(() => !isConnecting || hasFrame, [isConnecting, hasFrame]);

  useEffect(() => {
    if (!isCanvasVisible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel, isCanvasVisible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        dispatchAction({ action: RemoteAppWindowAction.TextInput, text: e.key });
        return;
      }

      const modifiers: string[] = [];
      if (e.metaKey) modifiers.push('cmd');
      if (e.ctrlKey) modifiers.push('ctrl');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');

      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      const keyStr = [...modifiers, e.key].join('+');
      dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: keyStr });
    },
    [dispatchAction],
  );

  const closeWindow = useCallback(() => {
    window.utils?.windowControls?.close();
  }, []);

  const windowTitle = title || 'Remote Window';

  return (
    <>
      <Head>
        <title>{windowTitle}</title>
      </Head>
      <div
        className='flex flex-col w-screen h-screen bg-transparent overflow-hidden'
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className='relative flex-1 flex items-center justify-center min-h-0'>
          {isConnecting && !hasFrame ? (
            <div className='flex flex-col items-center gap-2 text-white/60 text-sm'>
              <div className='h-6 w-6 border-2 border-white/30 border-t-white/80 rounded-full animate-spin' />
              Connecting...
            </div>
          ) : (
            <canvas
              ref={canvasRef}
              tabIndex={0}
              autoFocus
              onClick={handleClick}
              onDoubleClick={handleDoubleClick}
              onContextMenu={handleContextMenu}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onKeyDown={handleKeyDown}
              className='w-full h-full outline-none'
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
          )}

          {error && (
            <div
              className='absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm z-10'
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 text-red-400">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span className='text-sm text-red-400'>{error}</span>
              <button
                onClick={closeWindow}
                className='mt-1 px-4 py-1.5 text-xs text-white bg-white/15 hover:bg-white/25 rounded-md transition-colors'
              >
                Close Window
              </button>
            </div>
          )}

          {!error && hasFrame && <WindowFab onDispatchAction={dispatchAction} />}
        </div>
      </div>
    </>
  );
};

AppWindowPage.config = buildPageConfig(true);
export default AppWindowPage;
