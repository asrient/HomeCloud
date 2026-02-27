import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { PageBar, PageContent } from '@/components/pagePrimatives';
import { ThemedIconName } from '@/lib/enums';
import { getServiceController, buildPageConfig, cn, isMacosTheme, getAppName } from '@/lib/utils';
import { RemoteAppWindowAction } from '@/lib/enums';
import LoadingIcon from '@/components/ui/loadingIcon';
import { NextPageWithConfig } from '@/pages/_app';
import { Button } from '@/components/ui/button';
import {
  RemoteAppWindow,
  RemoteAppWindowTile,
  RemoteAppWindowUIState,
  RemoteAppWindowActionPayload,
} from 'shared/types';
import {
  Focus,
  Minus,
  Square,
  X,
  Mouse,
  MousePointer,
  Keyboard,
  Maximize2,
  Minimize2,
  RotateCcw,
} from 'lucide-react';

const TILE_SIZE = 64;
const QUALITY = 0.6;
const CAPTURE_INTERVAL_MS = 300;

// ── Coordinate helpers ──

/** Convert a mouse event on the (possibly CSS-scaled) canvas to native window coordinates. */
function canvasToWindowCoords(
  e: React.MouseEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top) * scaleY),
  };
}

// ── WindowCanvas – renders tiles and handles mouse/scroll/keyboard ──

function WindowCanvas({
  uiState,
  interactive,
  onAction,
}: {
  uiState: RemoteAppWindowUIState;
  interactive: boolean;
  onAction: (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const currentDims = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const [isFocused, setIsFocused] = useState(false);

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

  // ── Mouse handlers ──
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !canvasRef.current) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      onAction({ action: RemoteAppWindowAction.Click, x, y });
    },
    [interactive, onAction],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      onAction({ action: RemoteAppWindowAction.RightClick, x, y });
    },
    [interactive, onAction],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!interactive || !canvasRef.current) return;
      // Only send hover when a mouse button is held (drag-style), to avoid flooding
      if (e.buttons === 0) return;
      const { x, y } = canvasToWindowCoords(e, canvasRef.current);
      onAction({ action: RemoteAppWindowAction.Hover, x, y });
    },
    [interactive, onAction],
  );

  // ── Scroll handler ──
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!interactive || !canvasRef.current) return;
      e.preventDefault();
      const { x, y } = canvasToWindowCoords(e as any, canvasRef.current);
      // Normalise wheel delta: browsers give different scales
      const deltaX = Math.round(e.deltaX / 3);
      const deltaY = Math.round(e.deltaY / 3);
      if (deltaX === 0 && deltaY === 0) return;
      onAction({ action: RemoteAppWindowAction.Scroll, x, y, scrollDeltaX: deltaX, scrollDeltaY: deltaY });
    },
    [interactive, onAction],
  );

  // ── Keyboard handler ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLCanvasElement>) => {
      if (!interactive) return;
      e.preventDefault();
      e.stopPropagation();

      // For printable single characters, use TextInput for reliability
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        onAction({ action: RemoteAppWindowAction.TextInput, text: e.key });
        return;
      }

      // Map special keys to our key input format
      const modifiers: string[] = [];
      if (e.metaKey) modifiers.push('cmd');
      if (e.ctrlKey) modifiers.push('ctrl');
      if (e.altKey) modifiers.push('alt');
      if (e.shiftKey) modifiers.push('shift');

      // Skip sending bare modifier keys
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;

      const keyStr = [...modifiers, e.key].join('+');
      onAction({ action: RemoteAppWindowAction.KeyInput, key: keyStr });
    },
    [interactive, onAction],
  );

  if (!uiState) return null;

  return (
    <canvas
      ref={canvasRef}
      tabIndex={interactive ? 0 : undefined}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseMove={handleMouseMove}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      className={cn(
        'max-w-full h-auto rounded-md shadow-lg border outline-none',
        interactive
          ? isFocused
            ? 'border-primary cursor-crosshair ring-2 ring-primary/30'
            : 'border-primary/50 cursor-crosshair'
          : 'border-border/50',
      )}
      style={{
        aspectRatio: `${uiState.width} / ${uiState.height}`,
      }}
    />
  );
}

// ── Window toolbar ──

function WindowToolbar({
  windowId,
  interactive,
  onToggleInteractive,
  onAction,
}: {
  windowId: string;
  interactive: boolean;
  onToggleInteractive: () => void;
  onAction: (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => void;
}) {
  return (
    <div className='flex items-center gap-1 flex-wrap'>
      {/* Interactive mode toggle */}
      <Button
        variant={interactive ? 'default' : 'secondary'}
        size='sm'
        rounded={false}
        onClick={onToggleInteractive}
        title={interactive ? 'Disable interactive mode' : 'Enable interactive mode'}
        className='gap-1.5'
      >
        {interactive ? <Mouse className='h-3.5 w-3.5' /> : <MousePointer className='h-3.5 w-3.5' />}
        {interactive ? 'Interactive' : 'View Only'}
      </Button>

      <div className='w-px h-6 bg-border mx-1' />

      {/* Window management actions */}
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8'
        onClick={() => onAction({ action: RemoteAppWindowAction.Focus })}
        title='Focus window'
      >
        <Focus className='h-4 w-4' />
      </Button>

      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8'
        onClick={() => onAction({ action: RemoteAppWindowAction.Minimize })}
        title='Minimize window'
      >
        <Minus className='h-4 w-4' />
      </Button>

      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8'
        onClick={() => onAction({ action: RemoteAppWindowAction.Maximize })}
        title='Maximize window'
      >
        <Maximize2 className='h-4 w-4' />
      </Button>

      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8'
        onClick={() => onAction({ action: RemoteAppWindowAction.Restore })}
        title='Restore window'
      >
        <Minimize2 className='h-4 w-4' />
      </Button>

      <div className='w-px h-6 bg-border mx-1' />

      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8 text-destructive hover:text-destructive'
        onClick={() => onAction({ action: RemoteAppWindowAction.Close })}
        title='Close window'
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  );
}

// ── Keyboard shortcut input ──

function KeyboardInput({
  windowId,
  onAction,
}: {
  windowId: string;
  onAction: (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => void;
}) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onAction({ action: RemoteAppWindowAction.TextInput, text: trimmed });
    setText('');
  };

  return (
    <div className='flex items-center gap-2'>
      <Keyboard className='h-4 w-4 text-muted-foreground shrink-0' />
      <input
        type='text'
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder='Type text and press Enter to send...'
        className='flex-1 h-8 px-2 text-sm bg-muted rounded-md border border-border focus:outline-none focus:ring-1 focus:ring-primary'
      />
      <Button size='sm' onClick={handleSend} disabled={!text.trim()} className='h-8'>
        Send
      </Button>
    </div>
  );
}

function WindowSwitcher({
  windows,
  selectedWindowId,
  onSelect,
}: {
  windows: RemoteAppWindow[];
  selectedWindowId: string | null;
  onSelect: (windowId: string) => void;
}) {
  if (windows.length <= 1) return null;

  return (
    <div className='flex items-center gap-1.5 px-1'>
      {windows.map((w) => (
        <button
          key={w.id}
          onClick={() => onSelect(w.id)}
          className={cn(
            'px-3 py-1.5 text-xs rounded-md transition-colors truncate max-w-[200px]',
            selectedWindowId === w.id
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted hover:bg-accent text-muted-foreground'
          )}
          title={w.title || `Window ${w.id}`}
        >
          {w.title || `Window ${w.id}`}
        </button>
      ))}
    </div>
  );
}

const Page: NextPageWithConfig = () => {
  const router = useRouter();
  const { fingerprint: fingerprintStr, appId, name } = router.query as {
    fingerprint?: string;
    appId?: string;
    name?: string;
  };
  const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

  const [windows, setWindows] = useState<RemoteAppWindow[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);
  const [uiState, setUiState] = useState<RemoteAppWindowUIState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimestampRef = useRef<number>(0);
  const isMountedRef = useRef(true);
  const selectedWindowIdRef = useRef<string | null>(null);
  const fingerprintRef = useRef<string | null>(null);

  // Keep refs in sync
  selectedWindowIdRef.current = selectedWindowId;
  fingerprintRef.current = fingerprint;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Action dispatch ──
  const dispatchAction = useCallback(
    async (partialPayload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => {
      const windowId = selectedWindowIdRef.current;
      if (!windowId) return;
      try {
        const sc = await getServiceController(fingerprintRef.current);
        await sc.apps.performWindowAction({ ...partialPayload, windowId } as RemoteAppWindowActionPayload);
      } catch (e: any) {
        console.error('Action failed:', e);
      }
    },
    [],
  );

  // Load windows for the app
  const loadWindows = useCallback(async () => {
    if (!appId) return;
    setIsLoading(true);
    setError(null);
    try {
      const sc = await getServiceController(fingerprint);
      const appWindows = await sc.apps.getWindows(appId);
      if (!isMountedRef.current) return;
      setWindows(appWindows);
      if (appWindows.length > 0) {
        setSelectedWindowId((prev) => {
          if (prev && appWindows.some((w) => w.id === prev)) return prev;
          return appWindows[0].id;
        });
      }
    } catch (e: any) {
      if (!isMountedRef.current) return;
      console.error('Failed to load windows:', e);
      setError(e.message || 'Failed to load windows');
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [appId, fingerprint]);

  useEffect(() => {
    loadWindows();
  }, [loadWindows]);

  // Capture loop
  const consecutiveErrorsRef = useRef(0);
  const MAX_CONSECUTIVE_ERRORS = 3;

  const captureLoop = useCallback(async () => {
    const windowId = selectedWindowIdRef.current;
    if (!windowId || !isMountedRef.current) return;

    try {
      const sc = await getServiceController(fingerprintRef.current);
      if (windowId !== selectedWindowIdRef.current || !isMountedRef.current) return;

      const sinceTimestamp = lastTimestampRef.current;
      const snapshot = await sc.apps.getWindowSnapshot(
        windowId,
        sinceTimestamp,
        TILE_SIZE,
        QUALITY
      );
      if (windowId !== selectedWindowIdRef.current || !isMountedRef.current) return;

      consecutiveErrorsRef.current = 0;

      if (sinceTimestamp > 0 && snapshot.tiles.length > 0) {
        setUiState((prev) => {
          if (!prev) return snapshot;
          const tileMap = new Map<string, RemoteAppWindowTile>();
          for (const t of prev.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
          for (const t of snapshot.tiles) tileMap.set(`${t.xIndex}_${t.yIndex}`, t);
          return {
            ...snapshot,
            tiles: Array.from(tileMap.values()),
          };
        });
      } else {
        setUiState(snapshot);
      }

      if (snapshot.tiles.length > 0) {
        const maxTs = Math.max(...snapshot.tiles.map((t) => t.timestamp));
        lastTimestampRef.current = maxTs;
      }

      setIsCapturing(true);
    } catch (e: any) {
      console.error('Capture error:', e);
      consecutiveErrorsRef.current++;

      if (consecutiveErrorsRef.current >= MAX_CONSECUTIVE_ERRORS) {
        console.warn('Capture failed repeatedly, window likely closed.');
        setIsCapturing(false);
        setError('Window is no longer available. It may have been closed.');
        return;
      }
    }

    if (isMountedRef.current && selectedWindowIdRef.current === windowId) {
      captureTimerRef.current = setTimeout(captureLoop, CAPTURE_INTERVAL_MS);
    }
  }, []);

  // Start/stop capture when selected window changes
  useEffect(() => {
    if (!selectedWindowId) return;

    lastTimestampRef.current = 0;
    setUiState(null);
    setIsCapturing(false);
    consecutiveErrorsRef.current = 0;

    captureLoop();

    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = null;
      }
    };
  }, [selectedWindowId, captureLoop]);

  const appName = name || appId || 'App';

  return (
    <>
      <Head>
        <title>{appName} - {getAppName()}</title>
      </Head>
      <PageBar title={appName} icon={ThemedIconName.Apps}>
        <WindowSwitcher
          windows={windows}
          selectedWindowId={selectedWindowId}
          onSelect={(id) => setSelectedWindowId(id)}
        />
      </PageBar>
      <PageContent>
        {isLoading ? (
          <div className='flex items-center justify-center py-20'>
            <LoadingIcon className='h-8 w-8 mr-2' />
            <span className='text-muted-foreground'>Loading windows...</span>
          </div>
        ) : error ? (
          <div className='flex flex-col items-center justify-center py-20 text-destructive'>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 mb-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <span>{error}</span>
            <button className='mt-3 text-sm text-primary underline' onClick={loadWindows}>
              Retry
            </button>
          </div>
        ) : windows.length === 0 ? (
          <div className='flex flex-col items-center justify-center py-20 text-muted-foreground'>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-10 w-10 mb-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z" />
            </svg>
            <span>No windows found for {appName}.</span>
            <button className='mt-3 text-sm text-primary underline' onClick={loadWindows}>
              Refresh
            </button>
          </div>
        ) : (
          <div className={cn(
            'flex flex-col items-center gap-3 p-4',
            isMacosTheme() ? 'pt-2' : 'pt-4'
          )}>
            {/* Toolbar */}
            {selectedWindowId && (
              <div className='w-full max-w-4xl flex items-center justify-between gap-2 flex-wrap'>
                <WindowToolbar
                  windowId={selectedWindowId}
                  interactive={interactive}
                  onToggleInteractive={() => setInteractive((v) => !v)}
                  onAction={dispatchAction}
                />
                <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                  {isCapturing && (
                    <span className='flex items-center gap-1'>
                      <span className='h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse' />
                      Live
                    </span>
                  )}
                  {interactive && (
                    <span className='text-primary'>Click canvas to interact</span>
                  )}
                </div>
              </div>
            )}

            {/* Capture state indicator */}
            {!isCapturing && selectedWindowId && (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <LoadingIcon className='h-4 w-4' />
                Connecting to window...
              </div>
            )}

            {/* Window display */}
            {uiState && (
              <WindowCanvas
                uiState={uiState}
                interactive={interactive}
                onAction={dispatchAction}
              />
            )}

            {/* Text input bar */}
            {interactive && selectedWindowId && (
              <div className='w-full max-w-4xl'>
                <KeyboardInput windowId={selectedWindowId} onAction={dispatchAction} />
              </div>
            )}
          </div>
        )}
      </PageContent>
    </>
  );
};

Page.config = buildPageConfig();
export default Page;
