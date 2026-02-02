import Image from 'next/image'
import Head from 'next/head'
import { PageBar, PageContent } from "@/components/pagePrimatives";
import { ThemedIconName } from '@/lib/enums'
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SortBy, Group } from '@/components/filesView';
import { useFolder } from '@/components/hooks/useFolders';
import { ClipboardContent, PeerInfo, RemoteItem } from 'shared/types';
import { FileRemoteItem } from '@/lib/types';
import { remoteItemToFileRemoteItem } from '@/lib/fileUtils';
import { useAppState } from '@/components/hooks/useAppState';
import { usePeer, usePeerConnectionState } from '@/components/hooks/usePeerState';
import { cn, getServiceController, getUrlFromIconKey, isMacosTheme, isWin11Theme } from '@/lib/utils';
import { Volume2, FolderClosed, Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Airplay, Keyboard, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionIcon } from '@/components/deviceSwitcher';
import { useBatteryInfo, useMediaPlayback, useVolume } from '@/components/hooks/useSystemState';
import { PauseIcon, PlayIcon, ForwardIcon, BackwardIcon } from '@heroicons/react/24/solid';
import TextModal from '@/components/textModal';
import ConfirmModal from '@/components/confirmModal';
import LoadingIcon from '@/components/ui/loadingIcon';
import { Slider } from "@/components/ui/slider"
import { DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DisksGrid } from '@/components/DisksGrid';
import { getAppName } from '@/lib/utils';

const DrivesSection = ({
  fingerprint,
  title,
}: {
  fingerprint: string | null;
  title: string;
}) => {
  const { remoteItems } = useFolder(fingerprint, '');

  const items: FileRemoteItem[] = useMemo(() => {
    return remoteItems.map(item => remoteItemToFileRemoteItem(item, fingerprint));
  }, [remoteItems, fingerprint]);

  return (
    <Group
      title={title}
      items={items}
      sortBy={SortBy.None}
      view='grid'
    />
  )
}

const BatteryIcon = ({ level, isCharging, size }: { level: number, isCharging: boolean, size?: number }) => {
  if (isCharging) {
    return <BatteryCharging size={size} color='green' />;
  }
  if (level >= 80) {
    return <BatteryFull size={size} />;
  }
  if (level >= 60) {
    return <BatteryMedium size={size} />;
  }
  if (level >= 30) {
    return <BatteryLow size={size} color='yellow' />;
  }
  return <Battery size={size} />;
}

const clipText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

const PeerInfoHero = ({ peer, isThisDevice }: { peer: PeerInfo, isThisDevice: boolean }) => {
  const connection = usePeerConnectionState(isThisDevice ? null : peer.fingerprint);
  const { batteryInfo, isLoading: batteryInfoLoading } = useBatteryInfo(isThisDevice ? null : peer.fingerprint);
  const { mediaPlayback, play, pause, previous, next, canControl, isLoading: mediaPlaybackLoading } = useMediaPlayback(isThisDevice ? null : peer.fingerprint);
  return (
    <div className={cn("py-3 px-4 lg:px-6 xl:px-10 lg:min-h-[12rem] flex flex-col lg:flex-row items-center justify-around lg:justify-between relative border-b lg:border-b-0 border-border/70")}>
      <div className='flex items-center space-x-4 w-fit px-5 py-8'>
        <div><Image src={getUrlFromIconKey(peer.iconKey)} width={150} height={150} alt="Peer icon" /></div>
        <div className="flex flex-col text-base">
          <div className={cn("text-foreground", isWin11Theme() ? 'font-light text-lg' : 'font-medium text-md')}>{peer.deviceName || 'Anonymous device'}</div>
          <div className="flex flex-col text-foreground/80 text-sm space-y-2 w-full">
            <div>
              <span>{peer.deviceInfo.os || 'Unknown OS'}</span>
              <span className='ml-1'>{peer.deviceInfo.osFlavour || 'Unknown platform'}</span>
            </div>
            <div className='text-xs justify-start flex-row flex w-full gap-6'>
              {
                !(batteryInfoLoading) && <div className='flex flex-row justify-center items-center w-max gap-2'>
                  <BatteryIcon size={22} level={batteryInfo ? batteryInfo.level * 100 : 0} isCharging={batteryInfo ? batteryInfo.isCharging : false} />
                  {batteryInfo ? `${Math.round(batteryInfo.level * 100)}%` : ''}
                  {batteryInfo && batteryInfo.isCharging ? ' - Charging' : ''}
                </div>
              }
              {
                !isThisDevice && <div className='flex items-center flex-row justify-center w-max'>
                  <ConnectionIcon connection={connection} size={16} />
                  <span className='ml-2'>{!!connection ? 'Online' : 'Offline'}</span>
                </div>
              }
            </div>
          </div>
        </div>
      </div>
      {
        canControl &&
        <div className={cn('px-6 py-3 text-sm w-full lg:w-[40%] min-w-[12rem] space-y-1 border-t lg:border-l lg:border-t-0 border-border/70 flex flex-col items-center lg:items-start justify-center min-h-[8rem] lg:min-h-[7rem]')}>
          <div className='font-medium mb-1 text-xs text-foreground/80'>
            <Airplay size={16} className="inline-block mr-2" />
            Now Playing
          </div>

          <div className={'flex flex-col items-center lg:items-start gap-1'}>
            <div className='font-semibold truncate max-w-xs'>{mediaPlayback ? mediaPlayback.trackName : 'Not playing'}</div>
            <div className='text-xs text-foreground/80 truncate max-w-xs'>{mediaPlayback && mediaPlayback.artistName ? mediaPlayback.artistName : ''}</div>
          </div>
          <div className='flex flex-row space-x-4'>
            <Button variant='ghost' size='icon' onClick={() => previous()} disabled={mediaPlaybackLoading || !mediaPlayback}>
              <BackwardIcon className='w-5 h-5' />
            </Button>
            {
              mediaPlayback && mediaPlayback.isPlaying ? (
                <Button variant='ghost' size='icon' onClick={() => pause()} disabled={mediaPlaybackLoading}>
                  <PauseIcon className='w-5 h-5' />
                </Button>
              ) : (
                <Button variant='ghost' size='icon' onClick={() => play()} disabled={mediaPlaybackLoading || !mediaPlayback}>
                  <PlayIcon className='w-5 h-5' />
                </Button>
              )
            }
            <Button variant='ghost' size='icon' onClick={() => next()} disabled={mediaPlaybackLoading || !mediaPlayback}>
              <ForwardIcon className='w-5 h-5' />
            </Button>
          </div>

        </div>
      }
    </div>
  )
}

function ClipboardButton({ deviceFingerprint }: { deviceFingerprint: string | null }) {
  const [content, setContent] = useState<ClipboardContent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const onClipboardClick = useCallback(async () => {
    setIsLoading(true);
    try {
      const sc = await getServiceController(deviceFingerprint);
      const clipboardContent = await sc.system.readClipboard();
      setContent(clipboardContent);
      setModalOpen(true);
    } catch (e) {
      console.error('Error fetching clipboard content:', e);
    } finally {
      setIsLoading(false);
    }
  }, [deviceFingerprint]);

  const onCopy = useCallback(async () => {
    if (!content) {
      return;
    }
    const localSc = window.modules.getLocalServiceController();
    localSc.system.copyToClipboard(content.content, content.type);
  }, [content]);

  const previewText = useMemo(() => {
    return content ? clipText(content.content, 150) : 'No clipboard content';
  }, [content]);

  return (
    <ConfirmModal
      title='Device Clipboard'
      buttonVariant='default'
      isOpen={modalOpen}
      onOpenChange={setModalOpen}
      description={previewText}
      buttonText='Copy'
      onConfirm={onCopy}
    >
      <Button variant='ghost' size='sm' disabled={isLoading} onClick={onClipboardClick}>
        {
          isLoading ? <LoadingIcon className='mr-2 h-4 w-4' /> : <Clipboard className='mr-2' size={16} />
        }
        Clipboard
      </Button>
    </ConfirmModal>)
}

function FilesSendAction({ deviceFingerprint }: { deviceFingerprint: string | null }) {
  const [files, setFiles] = useState<RemoteItem[]>([]);

  const isConfirmOpen = useMemo(() => files.length > 0, [files]);

  const cancelConfirm = useCallback(() => {
    setFiles([]);
  }, []);

  const confirmDesc = useMemo(() => {
    if (files.length === 1) {
      return `Send "${files[0].name}" to device?`;
    }
    return `Send ${files.length} files to device?`;
  }, [files]);

  const onFileUpload = useCallback(async () => {
    console.log('Uploading files to device:', deviceFingerprint, files);
    try {
      const sc = await getServiceController(deviceFingerprint);
      for (const asset of files) {
        await sc.files.download(window.modules.config.FINGERPRINT, asset.path);
      }
    } catch (e) {
      console.error('Error sending files to device:', e);
      const localSc = window.modules.getLocalServiceController();
      localSc.system.alert('Could not send files', 'An error occurred while sending files.');
    }
    finally {
      setFiles([]);
    }
  }, [deviceFingerprint, files]);

  const openFileSelector = useCallback(async () => {
    // Open file selector and handle file selection
    const localSc = window.modules.getLocalServiceController();
    const files = await localSc.files.openFilePicker(true, false, undefined, 'Select files to send', 'Select');
    if (!files || files.length === 0) {
      return;
    }
    setFiles(files);
  }, []);

  return (<>
    <Button onClick={openFileSelector} variant='ghost' size='sm'>
      <FolderClosed className='mr-2' size={16} />Send Files
    </Button>
    <ConfirmModal
      title='Send Files'
      description={confirmDesc}
      isOpen={isConfirmOpen}
      onOpenChange={cancelConfirm}
      buttonText='Send'
      onConfirm={onFileUpload}
    />
  </>);
}

function VolumeControl({ deviceFingerprint }: { deviceFingerprint: string | null }) {
  const { volumeLevel, setVolume, isLoading } = useVolume(deviceFingerprint);
  const [localLevel, setLocalLevel] = useState(volumeLevel);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setLocalLevel(volumeLevel);
  }, [volumeLevel]);

  const setVolumeCallback = useCallback(async (value: number[]) => {
    const level = value[0];
    // change number from 0-100 to 0-1
    setLocalLevel(level / 100);
    setIsUpdating(true);
    try {
      await setVolume(level / 100);
    } catch (e) {
      console.error('Error setting volume:', e);
      const localSc = window.modules.getLocalServiceController();
      localSc.system.alert('Could not set volume', 'An error occurred while setting the volume.');
    } finally {
      setIsUpdating(false);
    }
  }, [setVolume]);

  // Display a slider to control volume
  return (
    <div className='w-full flex flex-row'>
      <Slider
        value={[(localLevel || 0) * 100]}
        onValueChange={setVolumeCallback}
        min={0}
        max={100}
        step={5}
        disabled={isLoading || isUpdating}
      />
      <div className={cn('ml-4 w-12 text-right', (isLoading || isUpdating) && 'text-foreground/50')}>
        {`${Math.round((localLevel || 0) * 100)}%`}
      </div>
    </div>
  );
}

function VolumeModal({ children, deviceFingerprint }: {
  children?: React.ReactNode,
  deviceFingerprint: string | null,
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen} >
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[25rem]">
        <DialogHeader>
          <DialogTitle>
            Device Volume
          </DialogTitle>
        </DialogHeader>
        {
          open && <div className='py-8 px-5'>
            <VolumeControl deviceFingerprint={deviceFingerprint} />
          </div>
        }
      </DialogContent>
    </Dialog>
  );
}

function QuickActionsBar({ deviceFingerprint }: { deviceFingerprint: string | null }) {
  const { peers } = useAppState();
  const peerInfo = useMemo(() => {
    if (!deviceFingerprint) {
      return null;
    }
    return peers.find(p => p.fingerprint === deviceFingerprint) || null;
  }, [deviceFingerprint, peers]);

  const onTextSend = useCallback(async (text: string) => {
    const sc = await getServiceController(deviceFingerprint);
    sc.app.receiveContent(null, text.trim(), 'text').catch((error) => {
      console.error('Error sending message to device:', error);
      const localSc = window.modules.getLocalServiceController();
      localSc.system.alert('Could not send', 'An error occurred.');
    });
  }, [deviceFingerprint]);

  return (
    <div className='p-1 flex flex-row items-center justify-center lg:justify-start space-x-1 border-b border-border/70'>
      <FilesSendAction deviceFingerprint={deviceFingerprint} />
      <TextModal onDone={onTextSend}
        title='Send Text'
        description={`Send text to ${peerInfo ? peerInfo.deviceName : 'device'}.`}
        rows={4}
        placeholder='Type here'
        buttonText='Send'>
        <Button variant='ghost' size='sm'>
          <Keyboard className='mr-2' size={16} />Send Text
        </Button>
      </TextModal>
      <VolumeModal deviceFingerprint={deviceFingerprint}>
        <Button variant='ghost' size='sm'>
          <Volume2 className='mr-2' size={16} />Volume
        </Button>
      </VolumeModal>
      <ClipboardButton deviceFingerprint={deviceFingerprint} />
    </div>
  )
}

export default function Home() {
  const { selectedFingerprint } = useAppState();
  const peer = usePeer(selectedFingerprint);

  return (
    <>
      <Head>
        <title>{getAppName()}</title>
      </Head>

      <PageBar icon={ThemedIconName.Home} title={getAppName()}>
      </PageBar>
      <PageContent>
        {peer && <PeerInfoHero peer={peer} isThisDevice={selectedFingerprint === null} />}
        <QuickActionsBar deviceFingerprint={selectedFingerprint} />
        <div className='py-5 px-3'>
          <div className='mb-3 font-semibold text-md'>
            Storage
          </div>
        <DisksGrid deviceFingerprint={selectedFingerprint} />
        </div>
      </PageContent>
    </>
  )
}
