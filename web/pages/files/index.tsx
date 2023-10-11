import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { RemoteItem, SidebarType, RemoteItemWithStorage } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { GridGroup, SortBy } from '@/components/filesView'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import { useAppState } from "@/components/hooks/useAppState";
import { folderViewUrl } from "@/lib/urls";
import { pinnedFolderToRemoteItem, storageToRemoteItem } from "@/lib/fileUtils";
import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'

const inter = Inter({ subsets: ['latin'] })

const Page: NextPageWithConfig = () => {
  const { push } = useRouter();
  const storages = useFilterStorages(AppName.Files);
  const { pinnedFolders } = useAppState();

  const pinnedItems = useMemo(() => {
    return pinnedFolders.map(pinnedFolderToRemoteItem);
  }, [pinnedFolders]);

  const storageItems = useMemo(() => {
    return storages.map(storageToRemoteItem);
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
        <GridGroup
          title='Favorites'
          items={pinnedItems}
          sortBy={SortBy.None}
          onDbClick={openItem}
        />
        <GridGroup
          title='My Storages'
          items={storageItems}
          sortBy={SortBy.None}
          onDbClick={openItem}
        />
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
