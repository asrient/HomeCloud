import { useCallback, useState } from 'react';
import { RemoteAppWindowAction } from '@/lib/enums';
import { RemoteAppWindowActionPayload } from 'shared/types';
import { Keyboard, X, Minus, Maximize2, MonitorOff, SendHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

interface WindowFabProps {
  onDispatchAction: (payload: Omit<RemoteAppWindowActionPayload, 'windowId'>) => void;
}

export default function WindowFab({ onDispatchAction }: WindowFabProps) {
  const [open, setOpen] = useState(false);
  const [textInput, setTextInput] = useState('');

  const closeWindow = useCallback(() => {
    window.utils?.windowControls?.close();
  }, []);

  const minimizeWindow = useCallback(() => {
    window.utils?.windowControls?.minimize();
    setOpen(false);
  }, []);

  const maximizeWindow = useCallback(() => {
    window.utils?.windowControls?.maximize();
    setOpen(false);
  }, []);

  const closeRemoteWindow = useCallback(() => {
    onDispatchAction({ action: RemoteAppWindowAction.Close });
    setOpen(false);
  }, [onDispatchAction]);

  const handleSendText = useCallback(() => {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    onDispatchAction({ action: RemoteAppWindowAction.TextInput, text: trimmed });
    setTextInput('');
  }, [textInput, onDispatchAction]);

  return (
    <>
      {/* Collapsed: clickable pill */}
      {!open && (
        <div
          className='absolute top-0 left-1/2 -translate-x-1/2 z-30 app-dragable'
        >
          <div
            className='w-20 h-3 flex items-center justify-center bg-neutral-500/30 rounded-b-sm'
          >
            <div
              className='w-10 h-1.5 rounded-full bg-neutral-500/40 hover:bg-neutral-400/60 hover:w-14 hover:h-2 transition-all duration-200'
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              onClick={() => setOpen(true)}
            />
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-w-xs' style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <DialogHeader>
            <DialogTitle>Window Controls</DialogTitle>
            <DialogDescription>Manage the remote window</DialogDescription>
          </DialogHeader>

          <div className='grid grid-cols-2 gap-2'>
            <Button variant='secondary' size='sm' onClick={minimizeWindow}>
              <Minus className='h-4 w-4 mr-1.5' /> Minimize
            </Button>
            <Button variant='secondary' size='sm' onClick={maximizeWindow}>
              <Maximize2 className='h-4 w-4 mr-1.5' /> Maximize
            </Button>
            <Button variant='secondary' size='sm' onClick={closeRemoteWindow}>
              <X className='h-4 w-4 mr-1.5' /> Close Window
            </Button>
            <Button variant='destructive' size='sm' onClick={closeWindow}>
              <MonitorOff className='h-4 w-4 mr-1.5' /> Stop Screen
            </Button>
          </div>

          <Separator />

          <div className='flex items-center gap-2'>
            <Keyboard className='h-4 w-4 text-muted-foreground shrink-0' />
            <Input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSendText();
                }
              }}
              placeholder='Type text and press Enter...'
              className='h-8 text-xs'
            />
            <Button
              variant='ghost'
              size='icon'
              onClick={handleSendText}
              disabled={!textInput.trim()}
              className='shrink-0 h-8 w-8'
            >
              <SendHorizontal className='h-3.5 w-3.5' />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
