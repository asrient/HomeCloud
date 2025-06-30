import { useRouter } from 'next/router'
import { buildPageConfig, getServiceController, isMobile } from '@/lib/utils'
import { FileList_, SidebarType } from "@/lib/types"
import { RemoteItem, PeerInfo } from 'shared/types'
import { NextPageWithConfig } from '@/pages/_app'
import FilesView, { SortBy, GroupBy, FileRemoteItem } from '@/components/filesView'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import LoadingIcon from '@/components/ui/loadingIcon'
import Image from 'next/image'
import PageBar from '@/components/pageBar'
import { canPreview, getDefaultIcon, getNativeFilesAppIcon, getNativeFilesAppName, hasItemsToCopy, setItemsToCopy, performCopyItems } from '@/lib/fileUtils'
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
import { toast, useToast } from '@/components/ui/use-toast'
import mime from 'mime'
import PreviewModal from '@/components/preview'
import DeviceSelectorModal, { Device } from '@/components/deviceSelectorModal'
import { useFolder, useStat } from '@/components/hooks/useFolders'
import { useAppState } from '@/components/hooks/useAppState'

function OpenInDevice({ file, reset }: {
  file: FileRemoteItem | null,
  reset: () => void,
}) {

  const { toast } = useToast();

  const onSelect = useCallback(async (device: Device) => {
    if (!file || !file.deviceFingerprint) return;
    console.log('Selected Device to open file', device);
    toast({
      title: `Opening "${file.name}" in ${device.deviceName}`,
    });
    try {
      // await openFileRemote({
      //   storageId: file.storageId,
      //   fileId: file.id,
      //   targetDeviceFingerprint: device.fingerprint,
      // });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: `Failed to open file in ${device.deviceName}`,
        description: e.message,
      });
    } finally {
      reset();
    }
  }, [file, reset, toast]);

  const setModal = useCallback((open: boolean) => {
    if (!open) {
      reset();
    }
  }, [reset]);

  return (<DeviceSelectorModal isOpen={!!file} setModal={setModal} showNearbyDevices={false} onSelect={onSelect} />)
}

const Page: NextPageWithConfig = () => {
  const router = useRouter()
  const { toast } = useToast();
  const { path, fingerprint: fingerprintStr } = router.query as { fingerprint: string, path: string };
  const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

  const { peers } = useAppState();
  const peer = useMemo(() => {
    return peers.find(p => p.fingerprint === fingerprint) || null;
  }, [fingerprint, peers]);

  const toFileRemoteItem = useCallback((item: RemoteItem): FileRemoteItem => {
  return {
    ...item,
    isSelected: false,
    deviceFingerprint: fingerprint,
  }
}, [fingerprint]);

  const { remoteItems, isLoading, error, reload, setRemoteItems } = useFolder<FileRemoteItem>(fingerprint, path, toFileRemoteItem);
  const { remoteItem: folderStat } = useStat(fingerprint, path);
  const [view, setView] = useState<'list' | 'grid'>('grid')
  const [selectMode, setSelectMode] = useState(false)
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [importPhotosDialogOpen, setImportPhotosDialogOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewItem, setPreviewItem] = useState<FileRemoteItem | null>(null);
  const [remoteOpenFile, setRemoteOpenFile] = useState<FileRemoteItem | null>(null);

  const selectedItems = useMemo(() => remoteItems.filter(item => item.isSelected), [remoteItems]);

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
  }, [selectedItems]);

  const defaultIcon = useMemo(() => folderStat ? getDefaultIcon(folderStat) : undefined, [folderStat]);

  const onViewChange = (value: string) => {
    setView(value as 'list' | 'grid')
  }

  const onUpload = useCallback(async (files: FileList_) => {
    const serviceController = window.modules.getLocalServiceController();
    const filePaths: string[] = [];
    Object.values(files).forEach(file => {
      if (file instanceof File && file.path) {
        filePaths.push(file.path);
      }
    });
    const items = await serviceController.files.move(fingerprint, path, filePaths);
    setRemoteItems((prevItems) => [...prevItems, ...items.map(toFileRemoteItem)]);
  }, [fingerprint, path, setRemoteItems, toFileRemoteItem])


  const onNewFolder = useCallback(async (name: string) => {
    const serviceController = await getServiceController(fingerprint);
    const newFolder = await serviceController.files.fs.mkDir(name, path);
    const item = toFileRemoteItem(newFolder);
    setRemoteItems((prevItems) => [...prevItems, item]);
  }, [fingerprint, path, setRemoteItems, toFileRemoteItem]);

  const selectItem = useCallback((item: FileRemoteItem, toggle = true, persistSelection?: boolean) => {
    setRemoteItems((prevItems) => prevItems.map(prevItem => {
      if (prevItem.path === item.path) {
        return {
          ...prevItem,
          isSelected: toggle ? !prevItem.isSelected : true,
        }
      }
      const persistSelection_ = selectMode || persistSelection;
      return { ...prevItem, isSelected: persistSelection_ ? prevItem.isSelected : false }
    }))
  }, [selectMode, setRemoteItems])

  const openItemNative = useCallback(async (item: FileRemoteItem) => {
    if (previewLoading) return;
    setPreviewLoading(true);
    try {
      // await openFileLocal(storageId as number, item.id);
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

  }, [previewLoading, toast]);

  const openItem = useCallback(async (item: FileRemoteItem) => {
    if (item.type === 'directory') {
      router.push(folderViewUrl(item.deviceFingerprint, item.path));
    } else {
      if (item.mimeType && canPreview(item.mimeType)) {
        setPreviewItem(item);
        return;
      }
      return openItemNative(item);
    }
  }, [openItemNative, router])

  const downloadSelected = useCallback(async () => {
    const item = selectedItems[0];
    if (!item || !item.deviceFingerprint) return;
    const serviceController = window.modules.getLocalServiceController();
    toast({
      title: 'Download started',
      description: item.name,
    });
    try {
      await serviceController.files.download(item.deviceFingerprint, item.path);
      toast({
        title: 'File downloaded',
        description: item.name,
      });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Could not download file',
        description: item.name,
      });
    }
  }, [selectedItems, toast]);

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
    setRemoteItems((prevItems) => prevItems.map(prevItem => ({
      ...prevItem,
      isSelected: false,
    })))
  }, [setRemoteItems])

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
    const item = selectedItems[0];
    const serviceController = await getServiceController(item.deviceFingerprint);
    const newItem = await serviceController.files.fs.rename(item.path, newName);
    setRemoteItems((prevItems) => prevItems.map(prevItem => {
      if (prevItem.path === item.path) {
        return {
          ...newItem,
          isSelected: true,
          deviceFingerprint: item.deviceFingerprint,
        }
      }
      return prevItem;
    }))
  }, [selectedItems, setRemoteItems]);

  const onDelete = useCallback(async () => {
    const ids = selectedItems.map(item => item.path);
    const serviceController = await getServiceController(fingerprint);
    const deletedIds = await serviceController.files.fs.unlinkMultiple(ids)
    if (deletedIds.length === 0) {
      throw new Error('Failed to delete items');
    }
    setRemoteItems((prevItems) => prevItems.filter(prevItem => !deletedIds.includes(prevItem.path)));
  }, [fingerprint, selectedItems, setRemoteItems]);

  const openDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(true);
  }, []);

  const cutCopy = useCallback((cut = false) => {
    const selectedIds = selectedItems.map(item => item.path);
    setItemsToCopy(fingerprint, selectedIds, cut);
  }, [selectedItems, fingerprint]);

  const isPastingRef = useRef(false);
  const paste = useCallback(async (e: any) => {
    if (isPastingRef.current) return;
    isPastingRef.current = true;
    toast({
      title: 'Pasting items here..',
    });
    try {
      const items = await performCopyItems(fingerprint, path);
      if (!items) return;
      console.log('new items added', items);
      const fileItems: FileRemoteItem[] = items.map(item => ({
        ...item,
        isSelected: true,
        deviceFingerprint: fingerprint,
      }));
      setRemoteItems((prevItems) => [...prevItems, ...fileItems]);
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Could not copy files',
        description: e.message,
      });
    } finally {
      isPastingRef.current = false;
    }
  }, [fingerprint, path, setRemoteItems, toast]);

  const pinFolder = useCallback(async () => {
    const item = selectedItems[0];
    if (!item || item.type !== 'directory') return;
    const serviceController = await getServiceController(item.deviceFingerprint);
    try {
      const pin = await serviceController.files.addPinnedFolder(item.path);
      console.log('Pinned folder:', pin);
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Uh oh! Something went wrong.',
        description: `Could not add "${item.name}" to favourites.`,
      });
    }
  }, [selectedItems, toast]);

  const openImportPhotosDialog = useCallback(() => {
    setImportPhotosDialogOpen(true);
  }, []);

  const openSelectedItem = useCallback(() => {
    const item = selectedItems[0];
    if (!item) return;
    openItem(item);
  }, [selectedItems, openItem]);

  const openSelectedItemNative = useCallback(() => {
    const item = selectedItems[0];
    if (!item) return;
    openItemNative(item);
  }, [selectedItems, openItemNative]);

  // const isSingleLocalItemSelected = useMemo(() => {
  //   if (selectedItems.length !== 1) return false;
  //   const item = selectedItems[0];
  //   const storage = storages?.find(s => s.id === item.storageId);
  //   return storage?.type === StorageType.Local;
  // }, [selectedItems, storages]);

  const openFileRemote = useCallback(() => {
    const item = selectedItems[0];
    if (!item) return;
    setRemoteOpenFile(item);
  }, [selectedItems]);

  if (isLoading || error) return (
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
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-16 w-16 text-destructive">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <div className='text-sm pt-2 max-w-md text-center'>{error}</div>
            </>
          )
        }
      </div>
    </>
  )

  const peerName = peer ? peer.deviceName : 'Unknown device'
  const selectedCount = selectedItems.length;
  const isFolderSelected = selectedCount === 1 && selectedItems[0].type === 'directory';

  return (
    <>
      <Head>
        <title>
          {
            folderStat && !['/', ''].includes(folderStat.name)
              ? `${folderStat.name} | ${peerName}`
              : peerName
          }
        </title>
      </Head>
      <main>
        <PageBar title={folderStat?.name || peerName} icon={defaultIcon}>
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
          <TextModal onOpenChange={setNewFolderDialogOpen} isOpen={newFolderDialogOpen} onDone={onNewFolder} title='New Folder' buttonText='Create'>
            <Button variant='ghost'>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </Button>
          </TextModal>
        </PageBar>
        <ContextMenu>
          <ContextMenuTrigger>
            <div onClick={onClickOutside} className='min-h-[90vh]' onContextMenu={onRightClickOutside}>
              <FilesView view={view}
                sortBy={SortBy.None}
                groupBy={GroupBy.None}
                onClick={onItemClick}
                onRightClick={onItemRightClick}
                onDbClick={onItemDbClick}
                items={remoteItems} />
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
                      Preview
                    </ContextMenuItem>
                    {/* {
                      isFolderSelected && isSingleLocalItemSelected && <ContextMenuItem disabled={previewLoading} onClick={openSelectedItemNative}>
                        <Image src={getNativeFilesAppIcon(deviceInfo)} alt='Folder Icon' width={16} height={16} className='mr-[0.2rem]' />
                        Open in {getNativeFilesAppName(deviceInfo)}
                      </ContextMenuItem>
                    } */}
                    {
                      !isFolderSelected && <ContextMenuItem disabled={previewLoading} onClick={openSelectedItemNative}>
                        Open in app..
                      </ContextMenuItem>
                    }
                    {
                      !isFolderSelected && <ContextMenuItem onClick={downloadSelected}>
                        Download
                      </ContextMenuItem>
                    }
                    <ContextMenuItem>Get info</ContextMenuItem>
                    {
                      isFolderSelected && (
                        <ContextMenuItem onClick={pinFolder}>Add to Favorites</ContextMenuItem>
                      )
                    }
                    <ContextMenuItem onClick={openRenameDialog}>
                      Rename..
                    </ContextMenuItem>
                    {
                      !isFolderSelected && <ContextMenuItem onClick={openFileRemote}>
                        Open in another device..
                      </ContextMenuItem>
                    }
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
                <ContextMenuItem onClick={() => cutCopy()}>Copy</ContextMenuItem>
                <ContextMenuItem onClick={() => cutCopy(true)}>Cut</ContextMenuItem>
                <ContextMenuItem className='text-red-500' onClick={openDeleteDialog}>
                  Delete
                </ContextMenuItem>
              </>)
                : (<>
                  <ContextMenuItem>Get info</ContextMenuItem>
                  <ContextMenuItem onClick={paste} disabled={!hasItemsToCopy()}>Paste</ContextMenuItem>
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
            description='You may or may not be able to recover them depending on your storage type.'
            buttonText='Delete'
            buttonVariant='destructive'
            onConfirm={onDelete}>
          </ConfirmModal>
        }
        <OpenInDevice file={remoteOpenFile} reset={() => setRemoteOpenFile(null)} />
        <PreviewModal item={previewItem} close={() => setPreviewItem(null)} />
        {
          previewLoading && <div className='fixed top-0 left-0 w-screen h-screen bg-background/80 z-50 flex flex-col justify-center items-center'>
            <LoadingIcon />
            <span className='text-xs pt-2'>Opening Item</span>
          </div>
        }
        {folderStat &&
          <div className='p-2 pt-3 md:py-1 md:sticky md:bottom-0 w-full bg-background z-10'>
            <FolderPath peer={peer} folder={folderStat} />
          </div>
        }
      </main>
    </>)
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
