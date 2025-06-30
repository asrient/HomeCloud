import { SidebarType, PhotosFetchOptions, PhotosSortOption } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
//import PhotosPage from '@/components/photosPage'
import { useMemo } from 'react';
import usePhotoLibraries from '@/components/hooks/usePhotoLibraries';

export default function Page() {
  const { libraries } = usePhotoLibraries();

  const fetchOptions: PhotosFetchOptions = useMemo(() => ({
    sortBy: PhotosSortOption.AddedOn,
    libraries,
    ascending: false,
  }), [libraries]);

  return (
    // <PhotosPage
    //   fetchOptions={fetchOptions}
    //   pageTitle='Recently Added'
    //   pageIcon='/icons/clock.png'
    // />
    null
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
