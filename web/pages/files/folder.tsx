import { useRouter } from 'next/router'
import { buildPageConfig } from '@/lib/utils'
import { RemoteItem, SidebarType, Storage } from "@/lib/types"
import { NextPageWithConfig } from '@/pages/_app'
import FilesView, { SortBy, GroupBy } from '@/components/filesView'
import { useEffect, useState } from 'react'
import { getStat, readDir } from '@/lib/api/fs'
import Head from 'next/head'
import { useAppState } from '@/components/hooks/useAppState'
import LoadingIcon from '@/components/ui/loadingIcon'
import Image from 'next/image'
import PageBar from '@/components/pageBar'
import { getDefaultIcon } from '@/lib/fileUtils'
import { Button } from '@/components/ui/button'

const Page: NextPageWithConfig = () => {
  const router = useRouter()
  const { s, id } = router.query as { s: string, id: string };
  const storageId = s ? parseInt(s) : null;
  const folderId = id || '/';
  const [items, setItems] = useState<RemoteItem[]>([])
  const [folderStat, setFolderStat] = useState<RemoteItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentStorageId, setCurrentStorageId] = useState<number | null>(null)
  const { storages } = useAppState()
  const [storage, setStorage] = useState<Storage | null>(null)

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
        setItems(items)
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
  const defaultIcon = folderStat ? getDefaultIcon(folderStat) : undefined;

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
          <Button variant='ghost'>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
            </svg>
          </Button>
        </PageBar>
        <FilesView storageId={storageId} view='grid' sortBy={SortBy.None} groupBy={GroupBy.None} items={items} />
      </main>
    </>)
}

Page.config = buildPageConfig(SidebarType.Files)
export default Page
