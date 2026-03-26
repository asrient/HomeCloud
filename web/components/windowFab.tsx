import { useCallback, useRef, useState } from 'react';
import { RemoteAppWindowAction, ConnectionType } from '@/lib/enums';
import { RemoteAppWindowActionPayload } from 'shared/types';
import { Keyboard, MonitorOff, SendHorizontal, GripHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface StreamStats {
  fps: number;
  bitrate: number;         // bytes per second (measured)
  resolution: string;      // e.g. "1920×1080"
  framesReceived: number;
}

export type OverlayPosition = 'top' | 'bottom' | 'left' | 'right';

interface WindowFabProps {
  onDispatchAction: (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => void;
  streamStats: StreamStats;
  targetFps: number;
  quality: number;
  onTargetFpsChange: (fps: number) => void;
  onQualityChange: (quality: number) => void;
  deviceName: string | null;
  connectionType: ConnectionType | null;
}

function formatBitrate(bytesPerSec: number): string {
  const bps = bytesPerSec * 8;
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`;
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} Kbps`;
  return `${bps.toFixed(0)} bps`;
}

const FPS_OPTIONS = [10, 15, 24, 30, 60, 120] as const;
const QUALITY_OPTIONS = [
  { value: 0.15, label: 'Low' },
  { value: 0.35, label: 'Medium' },
  { value: 0.6, label: 'High' },
  { value: 0.85, label: 'Ultra' },
] as const;

const FAB_POSITION_CLASSES: Record<OverlayPosition, string> = {
  top: 'top-0 left-1/2 -translate-x-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2',
  left: 'left-0 top-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 -translate-y-1/2',
};

const FAB_PILL_CLASSES: Record<OverlayPosition, string> = {
  top: 'w-12 h-3 hover:h-5 rounded-b-md',
  bottom: 'w-12 h-3 hover:h-5 rounded-t-md',
  left: 'h-12 w-3 hover:w-5 rounded-r-md',
  right: 'h-12 w-3 hover:w-5 rounded-l-md',
};

/** Non-interactive stats overlay — always top-right, hides on hover, click-through */
function StatsOverlay({ stats }: { stats: StreamStats }) {
  return (
    <div
      className='absolute z-20 top-2 right-2 pointer-events-none
        hover:opacity-0 transition-opacity duration-200'
    >
      <div className='flex flex-row gap-1.5
        bg-black/40 backdrop-blur-sm rounded-md px-2.5 py-1.5 text-[10px] text-white/70'>
        <span>{stats.fps} fps</span>
        <span className='text-white/30'>|</span>
        <span>{formatBitrate(stats.bitrate)}</span>
        <span className='text-white/30'>|</span>
        <span>{stats.resolution}</span>
      </div>
    </div>
  );
}

export default function WindowFab({
  onDispatchAction,
  streamStats,
  targetFps,
  quality,
  onTargetFpsChange,
  onQualityChange,
  deviceName,
  connectionType,
}: WindowFabProps) {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState('');
  const textInputRef = useRef('');
  const [showOverlay, setShowOverlay] = useState(false);
  const [fabPosition, setFabPosition] = useState<OverlayPosition>('top');

  const closeWindow = useCallback(() => {
    window.utils?.windowControls?.close();
  }, []);

  const handleSendText = useCallback(() => {
    const trimmed = textInputRef.current.trim();
    if (!trimmed) return;
    onDispatchAction({ action: RemoteAppWindowAction.TextInput, text: trimmed });
    setTextInput('');
    textInputRef.current = '';
  }, [onDispatchAction]);

  return (
    <>
      {/* Stats overlay (non-interactive, always top-right) */}
      {showOverlay && !open && (
        <StatsOverlay stats={streamStats} />
      )}

      {/* FAB pill */}
      {!open && (
        <div className={`absolute z-30 app-dragable ${FAB_POSITION_CLASSES[fabPosition]}`}>
          <div
            className={`flex items-center justify-center bg-white/10 hover:bg-white/20 cursor-pointer transition-all duration-200 ${FAB_PILL_CLASSES[fabPosition]}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => setOpen(true)}
          >
            <GripHorizontal className='h-2.5 w-2.5 text-white/40' />
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-xs' style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <DialogHeader>
            <DialogTitle>{deviceName ?? 'This Device'}</DialogTitle>
            <DialogDescription>
              Streaming over&nbsp;
              {
                connectionType === ConnectionType.LOCAL ? 'Local Network' :
                  connectionType === ConnectionType.WEB ? 'Web Connect' :
                    'Local'
              }.
            </DialogDescription>
          </DialogHeader>

          {/* FPS & Quality controls */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Max FPS</Label>
              <Select value={String(targetFps)} onValueChange={(v) => onTargetFpsChange(Number(v))}>
                <SelectTrigger className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FPS_OPTIONS.map((fps) => (
                    <SelectItem key={fps} value={String(fps)} className='text-xs'>{fps} fps</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-1.5'>
              <Label className='text-xs'>Quality</Label>
              <Select value={String(quality)} onValueChange={(v) => onQualityChange(Number(v))}>
                <SelectTrigger className='h-8 text-xs'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)} className='text-xs'>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* FAB position */}
          <div className='space-x-1.5 flex items-center justify-between'>
            <Label className='text-xs'>Controls position</Label>
            <Select value={fabPosition} onValueChange={(v) => setFabPosition(v as OverlayPosition)}>
              <SelectTrigger className='h-8 w-28 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='top' className='text-xs'>Top</SelectItem>
                <SelectItem value='bottom' className='text-xs'>Bottom</SelectItem>
                <SelectItem value='left' className='text-xs'>Left</SelectItem>
                <SelectItem value='right' className='text-xs'>Right</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Network info overlay toggle */}

          <div className='flex items-center justify-between'>
            <Label className='text-xs'>Show network stats</Label>
            <Switch checked={showOverlay} onCheckedChange={setShowOverlay} />
          </div>

          <Separator />

          {/* Text input */}
          <div className='flex items-center gap-2'>
            <Keyboard className='h-4 w-4 text-muted-foreground shrink-0' />
            <Input
              value={textInput}
              onChange={(e) => { setTextInput(e.target.value); textInputRef.current = e.target.value; }}
              onKeyDown={(e) => {
                e.stopPropagation();
              }}
              placeholder='Type text...'
              className='h-8 text-xs'
            />
            <Button
              type='button'
              variant='ghost'
              size='icon'
              onClick={handleSendText}
              disabled={!textInput.trim()}
              className='shrink-0 h-8 w-8'
            >
              <SendHorizontal className='h-3.5 w-3.5' />
            </Button>
          </div>

          <Separator />

          <Button variant='destructive' size='sm' onClick={closeWindow} className='w-full'>
            <MonitorOff className='h-4 w-4 mr-1.5' /> Stop Streaming
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
