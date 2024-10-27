import { Inter } from 'next/font/google'
import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { SidebarType, PinnedFolder, Storage, RemoteItem } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { Group, SortBy, FileRemoteItem } from '@/components/filesView'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import { useAppState } from "@/components/hooks/useAppState";
import { pinnedFolderToRemoteItem } from "@/lib/fileUtils";
import { useEffect, useMemo, useRef } from 'react'
import { useDisksForStorage } from '@/components/hooks/usePinnedFolders'

const inter = Inter({ subsets: ['latin'] })

const pinnedFolderToFileRemoteItem = (item: PinnedFolder, storage: Storage): FileRemoteItem => {
  return {
    ...pinnedFolderToRemoteItem(item, storage),
    isSelected: false,
  }
}

const remoteItemToFileRemoteItem = (item: RemoteItem, storage: Storage): FileRemoteItem => {
  return {
    ...item,
    isSelected: false,
    storageId: storage.id,
  }
}

const Page: NextPageWithConfig = () => {
  const storages = useFilterStorages(AppName.Files);
  const { pinnedFolders, disks } = useAppState();
  const { loadDisks } = useDisksForStorage();
  const hasRunEffect = useRef(false);

  // We only want to refresh the disks once when the page is loaded
  // The higher level hook usePinnedFolders will handle updating the disks when needed
  // Can also think of a better way by showing refresh button
  useEffect(() => {
    if (hasRunEffect.current) return;
    console.log('reloading disks..');
    storages.forEach((storage) => {
      loadDisks(storage);
    });
    hasRunEffect.current = true;
  }, [loadDisks, storages]);

  const storageSections: { title: string, items: FileRemoteItem[], key: string }[] = useMemo(() => {
    return storages.map(storage => {
      const pins: PinnedFolder[] = pinnedFolders ? (pinnedFolders[storage.id] || []) : [];
      const disks_ = disks ? (disks[storage.id] || []) : [];
      const items: FileRemoteItem[] = [];
      pins.forEach((pin) => {
        items.push(pinnedFolderToFileRemoteItem(pin, storage));
      });
      disks_.forEach((disk) => {
        items.push(remoteItemToFileRemoteItem(disk, storage));
      });
      return {
        title: storage.name,
        items,
        key: storage.id.toString(),
      };
    });
  }, [storages, pinnedFolders, disks]);

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
          storageSections.map((section) => (
            <Group
              key={section.key}
              title={section.title}
              items={section.items}
              sortBy={SortBy.None}
              view='grid'
            />
          ))
        }
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
