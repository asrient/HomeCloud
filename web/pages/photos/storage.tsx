import { AppName, SidebarType, PhotosFetchOptions } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PhotosPage from '@/components/photosPage'
import useFilterStorages from '@/components/hooks/useFilterStorages'
import { useMemo } from 'react';
import { useRouter } from 'next/router';

export default function Page() {
  const router = useRouter();
  const storages = useFilterStorages(AppName.Photos);
  const { id } = router.query as { id: string };

  const storage = useMemo(() => {
    return storages.find((s) => s.id === parseInt(id));
  }, [storages, id]);

  const fetchOptions: PhotosFetchOptions = useMemo(() => ({
    sortBy: 'addedOn',
    storageIds: [parseInt(id)],
    ascending: false,
  }), [id]);

  if(!id) return (
    <div className='p-5 py-10 min-h-[50vh] flex justify-center items-center text-red-500'>
      <span>Invalid storage id</span>
    </div>
  )

  return (
    <PhotosPage
      fetchOptions={fetchOptions}
      pageTitle={storage?.name || 'Invalid Storage'}
      pageIcon='/icons/ssd.png'
    />
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
