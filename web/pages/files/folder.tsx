import { useRouter } from 'next/router'
import { buildPageConfig, isMobile } from '@/lib/utils'
import { RemoteItem, SidebarType, Storage } from "@/lib/types"
import { NextPageWithConfig } from '@/pages/_app'
import FilesView, { SortBy, GroupBy, FileRemoteItem } from '@/components/filesView'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getStat, readDir, upload, mkDir, rename, unlinkMultiple } from '@/lib/api/fs'
import { addPin } from '@/lib/api/files'
import Head from 'next/head'
import { useAppDispatch, useAppState } from '@/components/hooks/useAppState'
import LoadingIcon from '@/components/ui/loadingIcon'
import Image from 'next/image'
import PageBar from '@/components/pageBar'
import { downloadLinkFromFileUrl, getDefaultIcon, getFileUrl } from '@/lib/fileUtils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import UploadFileSelector from '@/components/uploadFileSelector'
import TextModal from '@/components/textModal'
import FolderPath from '@/components/folderPath'
import { folderViewUrl } from '@/lib/urls'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ConfirmModal from '@/components/confirmModal'
import { ActionTypes } from '@/lib/state'
import { useToast } from '@/components/ui/use-toast'
import mime from 'mime'
import ImportPhotosModal from '@/components/importPhotosModal'

const Page: NextPageWithConfig = () => {
  const router = useRouter()
  const dispatch = useAppDispatch()
  const { toast } = useToast();
  const { s, id } = router.query as { s: string, id: string };
  const storageId = s ? parseInt(s) : null;
  const folderId = id || '/';
  const [items, setItems] = useState<FileRemoteItem[]>([])
  const [folderStat, setFolderStat] = useState<RemoteItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentStorageId, setCurrentStorageId] = useState<number | null>(null)
  const { storages } = useAppState()
  const [storage, setStorage] = useState<Storage | null>(null)
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [selectMode, setSelectMode] = useState(false)
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [importPhotosDialogOpen, setImportPhotosDialogOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)

  const selectedItems = useMemo(() => items.filter(item => item.isSelected), [items]);

  const photosImportable = useMemo(() => {
    if (selectedItems.length > 100) return false;
    if (selectedItems.length === 0) return false;
    for (const item of selectedItems) {
      if (item.type !== 'file') return false;
      if (!item.mimeType) {
        item.mimeType = mime.getType(item.name) || '';
      }
      if (!item.mimeType) return false;
      const type = item.mimeType.split('/')[0];
      if (type !== 'image' && type !== 'video') return false;
    }
    return true;
  }, [selectedItems])

  useEffect(() => {
    if (storageId && storages) {
      const storage = storages.find(s => s.id === storageId) || null;
      setStorage(storage)
    }
  }, [storageId, storages])

  useEffect(() => {
    async function fetchItems() {
      try {
        const items = await readDir({
          storageId: storageId!,
          id: folderId,
        })
        const fileItems: FileRemoteItem[] = items.map(item => ({
          ...item,
          isSelected: false,
          storageId,
        }))
        setItems(fileItems)
        const stat = await getStat({
          storageId: storageId!,
          id: folderId,
        })
        setFolderStat(stat)
      } catch (e: any) {
        console.error(e)
        setError(e.message)
      }
    }
    async function fetchStat() {
      try {
        const stat = await getStat({
          storageId: storageId!,
          id: folderId,
        })
        setFolderStat(stat)
      } catch (e) {
        console.error(e)
      }
    }
    if (!storageId) {
      setError('Invalid Storage')
      return
    }
    if (isLoading || (currentFolderId === folderId && currentStorageId === storageId)) return;
    setIsLoading(true)
    setError(null)
    setCurrentFolderId(folderId)
    setCurrentStorageId(storageId)
    setItems([])
    setFolderStat(null)
    Promise.all([
      fetchItems(),
      fetchStat(),
    ]).finally(() => {
      setIsLoading(false)
    })
  }, [storageId, folderId, isLoading, items, currentFolderId, currentStorageId])

  const defaultIcon = useMemo(() => folderStat ? getDefaultIcon(folderStat) : undefined, [folderStat]);

  const onViewChange = (value: string) => {
    setView(value as 'list' | 'grid')
  }

  const onUpload = useCallback(async (files: FileList) => {
    if (!storageId) throw new Error('Storage not set');
    if (!folderId) throw new Error('Folder not set');
    const items = await upload({
      storageId,
      parentId: folderId,
      files,
    })
    const fileItems: FileRemoteItem[] = items.map(item => ({
      ...item,
      isSelected: false,
      storageId,
    }))
    setItems((prevItems) => [...prevItems, ...fileItems]);
  }, [storageId, folderId])

  const onNewFolder = useCallback(async (name: string) => {
    if (!storageId) throw new Error('Storage not set');
    if (!folderId) throw new Error('Folder not set');
    const newFolder = await mkDir({
      storageId,
      parentId: folderId,
      name,
    })
    const item = {
      ...newFolder,
      isSelected: false,
      storageId,
    }
    setItems((prevItems) => [...prevItems, item]);
  }, [storageId, folderId]);

  const selectItem = useCallback((item: FileRemoteItem, toggle = true, persistSelection?: boolean) => {
    setItems((prevItems) => prevItems.map(prevItem => {
      if (prevItem.id === item.id) {
        return {
          ...prevItem,
          isSelected: toggle ? !prevItem.isSelected : true,
        }
      }
      const persistSelection_ = selectMode || persistSelection;
      return { ...prevItem, isSelected: persistSelection_ ? prevItem.isSelected : false }
    }))
  }, [selectMode])

  const fetchAssetUrl = useCallback(async (item: FileRemoteItem) => {
    if (item.type === 'directory') throw new Error('Cannot fetch asset url for a directory');
    if (item.assetUrl) return;
    if (!storageId) throw new Error('Storage not set');
    const url = await getFileUrl(storageId, item.id);
    item.assetUrl = url;
  }, [storageId])

  const openItem = useCallback(async (item: FileRemoteItem) => {
    if (item.type === 'directory') {
      router.push(folderViewUrl(storageId as number, item.id))
    } else {
      if (previewLoading) return;
      setPreviewLoading(true);
      try {
        await fetchAssetUrl(item);
        window.open(item.assetUrl, '_blank');
      } catch (e) {
        console.error(e);
        toast({
          variant: "destructive",
          title: 'Uh oh! Something went wrong.',
          description: `Could not open "${item.name}".`,
        });
      } finally {
        setPreviewLoading(false);
      }
    }
  }, [fetchAssetUrl, previewLoading, router, storageId, toast])

  const downloadSelected = useCallback(async () => {
    const item = selectedItems[0];
    if (!item) return;
    try {
      await fetchAssetUrl(item);
      const downloadLink = downloadLinkFromFileUrl(item.assetUrl!);
      window.open(downloadLink, '_blank');
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Uh oh! Something went wrong.',
        description: `Could not download "${item.name}".`,
      });
    }
  }, [selectedItems, fetchAssetUrl, toast])

  const onItemClick = useCallback((item: FileRemoteItem, e: React.MouseEvent) => {
    const isShift = e.shiftKey;
    e.stopPropagation();
    if (isMobile()) {
      openItem(item);
    } else {
      selectItem(item, true, isShift);
    }
  }, [openItem, selectItem])

  const onItemDbClick = useCallback((item: FileRemoteItem, e: React.MouseEvent) => {
    e.stopPropagation();
    openItem(item);
  }, [openItem]);

  const onClickOutside = useCallback(() => {
    setItems((prevItems) => prevItems.map(prevItem => ({
      ...prevItem,
      isSelected: false,
    })))
  }, [])

  const onItemRightClick = useCallback((item: FileRemoteItem, e: React.MouseEvent) => {
    selectItem(item, false, true)
  }, [selectItem])

  const onRightClickOutside = useCallback((e: React.MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('.fileItem')) return;
    onClickOutside()
  }, [onClickOutside])

  const toggleSelectMode = useCallback(() => {
    setSelectMode(!selectMode)
  }, [selectMode])

  const openNewFolderDialog = useCallback(() => {
    setNewFolderDialogOpen(true);
  }, []);

  const openRenameDialog = useCallback(() => {
    setRenameDialogOpen(true);
  }, []);

  const onRename = useCallback(async (newName: string) => {
    if (!storageId) throw new Error('Storage not set');
    if (!folderId) throw new Error('Folder not set');
    const item = selectedItems[0];
    const newItem = await rename({
      storageId,
      newName,
      id: item.id,
    })
    setItems((prevItems) => prevItems.map(prevItem => {
      if (prevItem.id === item.id) {
        return {
          ...newItem,
          isSelected: false,
          storageId,
        }
      }
      return prevItem;
    }))
  }, [storageId, folderId, selectedItems]);

  const onDelete = useCallback(async () => {
    if (!storageId) throw new Error('Storage not set');
    const ids = selectedItems.map(item => item.id);
    const { deletedIds } = await unlinkMultiple({
      storageId,
      ids,
    })
    if (deletedIds.length === 0) {
      throw new Error('Failed to delete items');
    }
    setItems((prevItems) => prevItems.filter(prevItem => !deletedIds.includes(prevItem.id)));
  }, [storageId, selectedItems]);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const pinFolder = useCallback(async () => {
    const item = selectedItems[0];
    if (!item || item.type !== 'directory' || !storage) return;
    try {
      const { pin } = await addPin({
        storageId: storage?.id,
        folderId: item.id,
      })
      dispatch(ActionTypes.ADD_PINNED_FOLDER, { pin });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Uh oh! Something went wrong.',
        description: `Could not add "${item.name}" to favourites.`,
      });
    }
  }, [selectedItems, storage, dispatch, toast]);

  const openImportPhotosDialog = useCallback(() => {
    setImportPhotosDialogOpen(true);
  }, []);

  const openSelectedItem = useCallback(() => {
    const item = selectedItems[0];
    if (!item) return;
    openItem(item);
  }, [selectedItems, openItem]);

  if (isLoading || error || !storageId) return (
    <>
      <Head><title>Files - HomeCloud</title></Head>
      <div className='container h-full flex flex-col justify-center items-center min-h-[90vh] p-5 text-slate-400'>
        {
          isLoading ? (
            <>
              <LoadingIcon />
              <span className='text-xs pt-2'>LOADING</span>
            </>
          ) : error && (
            <>
              <Image src='/icons/error.png' alt='Error Icon' width={80} height={80} />
              <div className='text-sm pt-4 max-w-md text-center'>{error}</div>
            </>
          )
        }
      </div>
    </>
  )

  const storageName = storage ? storage.name : 'Unknown storage'
  const selectedCount = selectedItems.length;
  const isFolderSelected = selectedCount === 1 && selectedItems[0].type === 'directory';

  return (
    <>
      <Head>
        <title>
          {
            folderStat && !['/', ''].includes(folderStat.name)
              ? `${folderStat.name} | ${storageName}`
              : storageName
          }
        </title>
      </Head>
      <main>
        <PageBar title={folderStat?.name || storageName} icon={defaultIcon}>
          <Button onClick={toggleSelectMode} variant={selectMode ? 'outline' : 'ghost'}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Button>
          <Select defaultValue={view} onValueChange={onViewChange}>
            <SelectTrigger className="px-1 border-none hover:bg-muted shadow-none">
              <SelectValue placeholder="view" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="list">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
              </SelectItem>
              <SelectItem value="grid">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </SelectItem>
            </SelectContent>
          </Select>
          <UploadFileSelector onUpload={onUpload} title='Upload files'>
            <Button variant='ghost'>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </Button>
          </UploadFileSelector>
          <TextModal onOpenChange={setNewFolderDialogOpen} isOpen={newFolderDialogOpen} onDone={onNewFolder} title='New Folder' description='Provide a name.' buttonText='Create'>
            <Button variant='ghost'>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </Button>
          </TextModal>
        </PageBar>
        {folderStat && storage && folderStat.parentIds && folderStat.parentIds.length > 0 &&
          <div className='p-2 pt-3 md:py-1 md:fixed md:bottom-0 w-full bg-background z-10'>
            <FolderPath storage={storage} folder={folderStat} />
          </div>
        }
        <ContextMenu>
          <ContextMenuTrigger>
            <div onClick={onClickOutside} className='min-h-[90vh]' onContextMenu={onRightClickOutside}>
              <FilesView view={view}
                sortBy={SortBy.None}
                groupBy={GroupBy.None}
                onClick={onItemClick}
                onRightClick={onItemRightClick}
                onDbClick={onItemDbClick}
                items={items} />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {
              selectedCount > 0 ? (<>
                {
                  selectedCount === 1 && (<>
                    <ContextMenuItem
                      disabled={previewLoading}
                      onClick={openSelectedItem}>
                      Open
                    </ContextMenuItem>
                    <ContextMenuItem onClick={downloadSelected}>
                      Download
                    </ContextMenuItem>
                    <ContextMenuItem>Get info</ContextMenuItem>
                    {
                      isFolderSelected && (
                        <ContextMenuItem onClick={pinFolder}>Add to Favorites</ContextMenuItem>
                      )
                    }
                    <ContextMenuItem onClick={openRenameDialog}>
                      Rename..
                    </ContextMenuItem>
                  </>)
                }
                {
                  photosImportable && (
                    <ContextMenuItem onClick={openImportPhotosDialog}>
                      <Image src='/icons/photos.png' alt='Photos Icon' width={16} height={16} className='mr-[0.2rem]' />
                      Import to photos..
                    </ContextMenuItem>
                  )
                }
                <ContextMenuItem disabled>Copy</ContextMenuItem>
                <ContextMenuItem disabled>Cut</ContextMenuItem>
                <ContextMenuItem className='text-red-500' onClick={openDeleteDialog}>
                  Delete
                </ContextMenuItem>
              </>)
                : (<>
                  <ContextMenuItem>Get info</ContextMenuItem>
                  <ContextMenuItem disabled>Paste</ContextMenuItem>
                  <ContextMenuItem onClick={openNewFolderDialog}>New Folder</ContextMenuItem>
                </>)
            }

          </ContextMenuContent>
        </ContextMenu>
        {selectedCount > 0 && <TextModal isOpen={renameDialogOpen} onOpenChange={setRenameDialogOpen}
          onDone={onRename} title='Rename' defaultValue={selectedItems[0].name}
          description='Provide a name.' buttonText='Save'>
        </TextModal>}
        {
          selectedCount > 0 && <ConfirmModal isOpen={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
            title={selectedCount > 1 ? `Delete ${selectedCount} items?` : `Delete "${selectedItems[0].name}"?`}
            description='These item(s) will be deleted from the remote storage. You may or may not be able to recover them depending on your storage type.'
            buttonText='Delete'
            buttonVariant='destructive'
            onConfirm={onDelete}>
          </ConfirmModal>
        }
        <ImportPhotosModal files={selectedItems} isOpen={importPhotosDialogOpen} onOpenChange={setImportPhotosDialogOpen} />
        {
          previewLoading && <div className='fixed top-0 left-0 w-screen h-screen bg-background/80 z-50 flex flex-col justify-center items-center'>
            <LoadingIcon />
            <span className='text-xs pt-2'>Loading Preview</span>
          </div>
        }
      </main>
    </>)
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
