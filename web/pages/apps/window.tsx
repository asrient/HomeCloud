import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getServiceController, buildPageConfig, cn } from '@/lib/utils';
import { NextPageWithConfig } from '@/pages/_app';
import { RemoteAppWindowAction } from '@/lib/enums';
import {
  RemoteAppWindowTile,
  RemoteAppWindowUIState,
  RemoteAppWindowActionPayload,
} from 'shared/types';
import WindowFab from '@/components/windowFab';

const TILE_SIZE = 64;
const QUALITY = 0.6;
const CAPTURE_INTERVAL_MS = 300;

/** Convert a mouse event on the (possibly CSS-scaled) canvas to native window coordinates. */
function canvasToWindowCoords(
  e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round(((e as MouseEvent).clientX - rect.left) * scaleX),
    y: Math.round(((e as MouseEvent).clientY - rect.top) * scaleY),
  };
}

/** Extract modifier keys from a mouse/keyboard event. */
function getModifiers(e: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }): string[] | undefined {
  const mods: string[] = [];
  if (e.shiftKey) mods.push('shift');
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.metaKey) mods.push('cmd');
  return mods.length > 0 ? mods : undefined;
}

// ── Full-window canvas with capture loop ──

const AppWindowPage: NextPageWithConfig = () => {
  const router = useRouter();
  const { windowId, fingerprint: fingerprintStr, title } = router.query as {
    windowId?: string;
    fingerprint?: string;
    title?: string;
  };
  const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const currentDims = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDraggingRef = useRef(false);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const windowIdRef = useRef<string | undefined>(undefined);
  const fingerprintRef = useRef<string | null>(null);
  const resizingFromRemoteRef = useRef(false);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [uiState, setUiState] = useState<RemoteAppWindowUIState | null>(null);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep refs in sync
  windowIdRef.current = windowId;
  fingerprintRef.current = fingerprint;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Clean up hover timer on unmount
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

  // ── Sync BrowserWindow size to remote window dimensions ──
  useEffect(() => {
    if (!uiState) return;
    const { width, height } = uiState;
    if (currentDims.current.w === width && currentDims.current.h === height) return;
    resizingFromRemoteRef.current = true;
    window.utils?.windowControls?.resize(width, height);
    // Reset flag after the resize event has fired
    setTimeout(() => { resizingFromRemoteRef.current = false; }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState?.width, uiState?.height]);

  // ── Dispatch Resize on BrowserWindow resize ──
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

  // ── Tile rendering ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !uiState) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (currentDims.current.w !== uiState.width || currentDims.current.h !== uiState.height) {
      canvas.width = uiState.width;
      canvas.height = uiState.height;
      currentDims.current = { w: uiState.width, h: uiState.height };
      imageCache.current.forEach((img, key) => {
        const [colStr, rowStr] = key.split('_');
        const x = parseInt(colStr) * TILE_SIZE;
        const y = parseInt(rowStr) * TILE_SIZE;
        ctx.drawImage(img, x, y, img.width, img.height);
      });
    }

    for (const tile of uiState.tiles) {
      const key = `${tile.xIndex}_${tile.yIndex}`;
      const cached = imageCache.current.get(key);
      if (cached && cached.dataset.ts === String(tile.timestamp)) continue;

      const img = new Image();
      img.onload = () => {
        img.dataset.ts = String(tile.timestamp);
        imageCache.current.set(key, img);
        const c = canvasRef.current;
        if (c) {
          const ct = c.getContext('2d');
          ct?.drawImage(img, tile.xIndex * TILE_SIZE, tile.yIndex * TILE_SIZE, tile.width, tile.height);
        }
      };
      img.src = `data:image/jpeg;base64,${tile.image}`;
    }
  }, [uiState]);

  // ── Capture loop ──
  const consecutiveErrorsRef = useRef(0);
  const MAX_CONSECUTIVE_ERRORS = 5;

  const captureLoop = useCallback(async () => {
    const wId = windowIdRef.current;
    if (!wId || !isMountedRef.current) return;

    try {
      const sc = await getServiceController(fingerprintRef.current);
      if (wId !== windowIdRef.current || !isMountedRef.current) return;

      const sinceTimestamp = lastTimestampRef.current;
      const snapshot = await sc.apps.getWindowSnapshot(wId, sinceTimestamp, TILE_SIZE, QUALITY);
      if (wId !== windowIdRef.current || !isMountedRef.current) return;

      consecutiveErrorsRef.current = 0;
      setIsConnecting(false);

      if (sinceTimestamp > 0 && snapshot.tiles.length > 0) {
        setUiState((prev) => {
          if (!prev) return snapshot;
          const tileMap = new Map<string, RemoteAppWindowTile>();
          for (const t of prev.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
          for (const t of snapshot.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
          return { ...snapshot, tiles: Array.from(tileMap.values()) };
        });
      } else {
        setUiState(snapshot);
      }

      if (snapshot.tiles.length > 0) {
        const maxTs = Math.max(...snapshot.tiles.map((t) => t.timestamp));
        lastTimestampRef.current = maxTs;
      }
    } catch (e: any) {
      console.error('Capture error:', e);
      consecutiveErrorsRef.current++;
      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setError('Window is no longer available. It may have been closed.');
        return;
      }
    }

    if (isMountedRef.current && windowIdRef.current === wId) {
      captureTimerRef.current = setTimeout(captureLoop, CAPTURE_INTERVAL_MS);
    }
  }, []);

  // Start capture when windowId is available
  useEffect(() => {
    if (!windowId) return;
    lastTimestampRef.current = 0;
    setUiState(null);
    setIsConnecting(true);
    consecutiveErrorsRef.current = 0;

    // Focus the remote window
    dispatchAction({ action: RemoteAppWindowAction.Focus });

    captureLoop();

    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [windowId, captureLoop, dispatchAction]);

  // ── Mouse handlers ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || isDraggingRef.current) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      dispatchAction({ action: RemoteAppWindowAction.Click, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      dispatchAction({ action: RemoteAppWindowAction.DoubleClick, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      dispatchAction({ action: RemoteAppWindowAction.RightClick, x, y, modifiers: getModifiers(e) });
    },
    [dispatchAction],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    isDraggingRef.current = false;
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);

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
        const { x, y } = canvasToWindowCoords(e, canvasRef.current);
        dispatchAction({ action: RemoteAppWindowAction.DragEnd, x, y, modifiers: getModifiers(e) });
        setTimeout(() => { isDraggingRef.current = false; }, 0);
      }
    },
    [dispatchAction],
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  }, []);

  // ── Scroll (native listener for non-passive) ──
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (!canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      const deltaX = Math.round(e.deltaX / 3);
      const deltaY = Math.round(e.deltaY / 3);
      if (deltaX === 0 && deltaY === 0) return;
      dispatchAction({ action: RemoteAppWindowAction.Scroll, x, y, scrollDeltaX: deltaX, scrollDeltaY: deltaY });
    },
    [dispatchAction],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Keyboard ──
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
        {/* Canvas area */}
        <div className='relative flex-1 flex items-center justify-center min-h-0'>
          {isConnecting && !uiState ? (
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
              className='w-full h-full outline-none cursor-crosshair'
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            />
          )}

          {/* Error / disconnected overlay */}
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

          {/* Floating Action Button */}
          {!error && uiState && <WindowFab onDispatchAction={dispatchAction} />}
        </div>
      </div>
    </>
  );
};

AppWindowPage.config = buildPageConfig(true);
export default AppWindowPage;
