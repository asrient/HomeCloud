import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { SidebarType, PinnedFolder, Storage } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { Group, SortBy, FileRemoteItem } from '@/components/filesView'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import { useAppState } from "@/components/hooks/useAppState";
import { pinnedFolderToRemoteItem, storageToRemoteItem } from "@/lib/fileUtils";
import { useMemo } from 'react'

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
  const storages = useFilterStorages(AppName.Files);
  const { pinnedFolders } = useAppState();

  const pinnedItems: FileRemoteItem[] = useMemo(() => {
    return pinnedFolders.map(pinnedFolderToFileRemoteItem);
  }, [pinnedFolders]);

  const storageItems: FileRemoteItem[] = useMemo(() => {
    return storages.map(storageToFileRemoteItem);
  }, [storages]);

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
        {
          pinnedItems.length > 0 
          && <Group
            title='Favorites'
            items={pinnedItems}
            sortBy={SortBy.None}
            view='grid'
          />
        }
        <Group
          title='My Storages'
          items={storageItems}
          sortBy={SortBy.None}
          view='grid'
        />
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
