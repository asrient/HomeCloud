import { AppName, SidebarType, PhotosFetchOptions } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PhotosPage from '@/components/photosPage'
import useFilterStorages from '@/components/hooks/useFilterStorages'
import { useMemo } from 'react';

export default function Page() {
  const storages = useFilterStorages(AppName.Photos);
  const storageIds = useMemo(() => storages.map((s) => s.id), [storages]);

  const fetchOptions: PhotosFetchOptions = useMemo(() => ({
    sortBy: 'capturedOn',
    storageIds,
    ascending: false,
  }), [storageIds]);

  return (
    <PhotosPage
      fetchOptions={fetchOptions}
      pageTitle='All Photos'
      pageIcon='/icons/photos.png'
    />
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
