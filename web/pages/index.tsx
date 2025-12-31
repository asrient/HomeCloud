import Image from 'next/image'
import Head from 'next/head'
import { PageBar, PageContent } from "@/components/pagePrimatives";
import { ThemedIconName } from '@/lib/enums'
import { useMemo } from 'react';
import { SortBy, Group } from '@/components/filesView';
import { useFolder } from '@/components/hooks/useFolders';
import { PeerInfo } from 'shared/types';
import { FileRemoteItem } from '@/lib/types';
import { remoteItemToFileRemoteItem } from '@/lib/fileUtils';
import { useAppState } from '@/components/hooks/useAppState';
import { usePeer, usePeerConnectionState } from '@/components/hooks/usePeerState';
import { cn, getUrlFromIconKey, isMacosTheme, printFingerprint, getOSIconUrl, isWin11Theme } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConnectionIcon } from '@/components/deviceSwitcher';

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

const PeerInfoHero = ({ peer, isThisDevice }: { peer: PeerInfo, isThisDevice: boolean }) => {
  const connection = usePeerConnectionState(isThisDevice ? null : peer.fingerprint);
  return (
    <div className={cn("py-3 px-4 lg:px-6 xl:px-10 min-h-[12rem] flex items-center justify-between relative")}>
      <div className='w-full flex items-center space-x-4'>
        <div><Image src={getUrlFromIconKey(peer.iconKey)} width={150} height={150} alt="Peer icon" /></div>
        <div className="flex flex-col text-base">
          <div className={cn("text-foreground", isWin11Theme() ? 'font-light text-xl' : 'font-semibold text-lg')}>{peer.deviceName || 'Anonymous device'}</div>
          <div className="flex flex-col text-foreground/80 text-base space-y-2">
            <div>
              <Image src={getOSIconUrl(peer.deviceInfo)} alt="OS icon" width={20} height={20} className='inline-block mr-1' />
              <span>{peer.deviceInfo.os || 'Unknown OS'}</span>
              <span className='ml-1'>{peer.deviceInfo.osFlavour || 'Unknown platform'}</span>
            </div>
            <div className='bg-foreground/20 py-1 px-2 rounded-md text-xs select-text max-w-min'>
              {printFingerprint(peer.fingerprint)}
            </div>
          </div>
        </div>
      </div>
      <div className={cn('px-4 py-3 text-sm w-[60%] min-w-[12rem] space-y-1 border-l border-border flex flex-col justify-center', isThisDevice ? 'min-h-[3rem]' : 'min-h-[6rem]')}>
        {isThisDevice ? (
          <div>This Device</div>
        ) : (
          <>
            <div className='flex items-center'>
              <ConnectionIcon connection={connection} size={20} />
              <span className='ml-2'>{!!connection ? 'Connected.' : 'Not connected.'}</span>
              <Button className='ml-1 text-primary' title='Reconnect' size={'sm'} variant='ghost'><RefreshCw size={16} /></Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const { selectedFingerprint } = useAppState();
  const peer = usePeer(selectedFingerprint);

  return (
    <>
      <Head>
        <title>Media Center</title>
      </Head>

      <PageBar icon={ThemedIconName.Home} title='Media Center'>
      </PageBar>
      <PageContent>
        {peer && <PeerInfoHero peer={peer} isThisDevice={selectedFingerprint === null} />}
        <div className="p-4 space-y-8">
          <DrivesSection fingerprint={selectedFingerprint} title="Storage" />
        </div>
      </PageContent>
    </>
  )
}
