import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { SidebarType } from "@/lib/types"
import { RemoteItem, PinnedFolder, PeerInfo } from 'shared/types'
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { Group, SortBy, FileRemoteItem } from '@/components/filesView'
import { useMemo } from 'react'
import { useFolder } from '@/components/hooks/useFolders'
import { usePeerState } from '@/components/hooks/usePeerState'

const inter = Inter({ subsets: ['latin'] })

const remoteItemToFileRemoteItem = (item: RemoteItem, fingerprint: string | null): FileRemoteItem => {
  return {
    ...item,
    isSelected: false,
    deviceFingerprint: fingerprint,
  }
}

const DeviceSectionView = ({
  peer,
}: {
  peer?: PeerInfo
}) => {
  const fingerprint = useMemo(() => !!peer ? peer.fingerprint : null, [peer]);
  const { remoteItems } = useFolder(fingerprint, '');

  const items: FileRemoteItem[] = useMemo(() => {
    return remoteItems.map(item => remoteItemToFileRemoteItem(item, fingerprint));
  }, [remoteItems, fingerprint]);

  return (
    <Group
      title={peer ? peer.deviceName : 'This Device'}
      items={items}
      sortBy={SortBy.None}
      view='grid'
    />
  )
}

const Page: NextPageWithConfig = () => {
  const peers = usePeerState();
  const onlinePeers = useMemo(() => peers.filter(peer => !!peer.connection), [peers]);

  return (
    <>
      <Head>
        <title>My Files</title>
      </Head>
      <PageBar icon='/icons/folder.png' title='My Files'>
      </PageBar>
      <main
        className={inter.className}
      >
        <DeviceSectionView/>
        {onlinePeers.map(peer => (
          <DeviceSectionView key={peer.fingerprint} peer={peer} />
        ))}
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
