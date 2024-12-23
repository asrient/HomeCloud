import { SidebarType, PhotosFetchOptions, PhotosSortOption } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PhotosPage from '@/components/photosPage'
import { useMemo } from 'react';
import { useRouter } from 'next/router';
import usePhotoLibraries from '@/components/hooks/usePhotoLibraries';

export default function Page() {
  const router = useRouter();
  const { s, lib } = router.query as { s: string; lib: string; };

  const { libraries } = usePhotoLibraries([{ storageId: parseInt(s), libraryId: parseInt(lib) }]);

  const fetchOptions: PhotosFetchOptions = useMemo(() => ({
    sortBy: PhotosSortOption.AddedOn,
    libraries,
    ascending: false,
  }), [libraries]);

  if (!libraries.length) return (
    <div className='p-5 py-10 min-h-[50vh] flex justify-center items-center text-red-500'>
      <span>Library not available.</span>
    </div>
  )

  return (
    <PhotosPage
      fetchOptions={fetchOptions}
      pageTitle={libraries[0]?.name || 'Invalid Storage'}
      pageIcon='/icons/ssd.png'
    />
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
