import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { RemoteItem, PinnedFolder, PeerInfo } from 'shared/types'
import type { NextPageWithConfig } from '../_app'
import {PageBar, PageContent} from "@/components/pagePrimatives";
import { Group, SortBy, FileRemoteItem } from '@/components/filesView'
import { useMemo } from 'react'
import { useFolder } from '@/components/hooks/useFolders'
import { usePeerState } from '@/components/hooks/usePeerState'
import { ThemedIconName } from '@/lib/enums'

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
      <PageBar icon={ThemedIconName.Folder} title='My Files'>
      </PageBar>
      <PageContent
        className={inter.className}
      >
        <DeviceSectionView/>
        {onlinePeers.map(peer => (
          <DeviceSectionView key={peer.fingerprint} peer={peer} />
        ))}
      </PageContent>
    </>
  )
}

Page.config = buildPageConfig()
export default Page
