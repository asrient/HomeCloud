import { AppName, SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PhotosPage, { FetchOptions } from '@/components/photosPage'
import useFilterStorages from '@/components/hooks/useFilterStorages'
import { useMemo } from 'react';

export default function Page() {
  const storages = useFilterStorages(AppName.Photos);
  const storageIds = useMemo(() => storages.map((s) => s.id), [storages]);

  const fetchOptions: FetchOptions = useMemo(() => ({
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
