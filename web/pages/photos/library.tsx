import { SidebarType, PhotosFetchOptions, PhotosSortOption } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
//import PhotosPage from '@/components/photosPage'
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
    <div className='p-5 py-10 min-h-[50vh] flex justify-center items-center text-destructive'>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 mr-1">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span>Library not available.</span>
    </div>
  )

  return (
    // <PhotosPage
    //   fetchOptions={fetchOptions}
    //   pageTitle={libraries[0]?.name || 'Library'}
    //   pageIcon='/icons/ssd.png'
    // />
    null
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
