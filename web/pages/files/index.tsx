import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { RemoteItem, SidebarType, RemoteItemWithStorage, PinnedFolder, Storage } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { Group, SortBy, FileRemoteItem } from '@/components/filesView'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import { useAppState } from "@/components/hooks/useAppState";
import { folderViewUrl } from "@/lib/urls";
import { pinnedFolderToRemoteItem, storageToRemoteItem } from "@/lib/fileUtils";
import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'

const inter = Inter({ subsets: ['latin'] })

const pinnedFolderToFileRemoteItem = (item: PinnedFolder): FileRemoteItem => {
  return {
    ...pinnedFolderToRemoteItem(item),
    isSelected: false,
  }
}

const storageToFileRemoteItem = (storage: Storage): FileRemoteItem => {
  return {
    ...storageToRemoteItem(storage),
    isSelected: false,
  }
}

const Page: NextPageWithConfig = () => {
  const { push } = useRouter();
  const storages = useFilterStorages(AppName.Files);
  const { pinnedFolders } = useAppState();

  const pinnedItems: FileRemoteItem[] = useMemo(() => {
    return pinnedFolders.map(pinnedFolderToFileRemoteItem);
  }, [pinnedFolders]);

  const storageItems: FileRemoteItem[] = useMemo(() => {
    return storages.map(storageToFileRemoteItem);
  }, [storages]);

  const openItem = useCallback((item: RemoteItem) => {
    const storageId = (item as RemoteItemWithStorage).storageId;
    if (!storageId) return;
    push(folderViewUrl(storageId, item.id));
  }, [push]);

  return (
    <>
      <Head>
        <title>Files</title>
      </Head>
      <PageBar icon='/icons/home.png' title='My Files'>
      </PageBar>
      <main
        className={inter.className}
      >
        <Group
          title='Favorites'
          items={pinnedItems}
          sortBy={SortBy.None}
          onDbClick={openItem}
          view='grid'
        />
        <Group
          title='My Storages'
          items={storageItems}
          sortBy={SortBy.None}
          onDbClick={openItem}
          view='grid'
        />
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
