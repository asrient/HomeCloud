import { SidebarType, PhotosFetchOptions, PhotosSortOption } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PhotosPage from '@/components/photosPage'
import { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { usePhotoLibrary } from '@/components/hooks/usePhotos';
import LoadingIcon from '@/components/ui/loadingIcon';
import { usePeer } from '@/components/hooks/usePeerState';

export default function Page() {
  const router = useRouter();
  const { fingerprint: fingerprintStr, lib } = router.query as { fingerprint: string | null; lib: string; };
  const fingerprint = useMemo(() => fingerprintStr ? fingerprintStr : null, [fingerprintStr]);

  const { photoLibrary, isLoading } = usePhotoLibrary(fingerprint, lib);

  const peer = usePeer(fingerprint);

  const fetchOptions: PhotosFetchOptions | null = useMemo(() => {
    if (!photoLibrary) {
      return null;
    }
    return {
      sortBy: PhotosSortOption.AddedOn,
      library: photoLibrary,
      ascending: false,
      deviceFingerprint: fingerprint,
    }
  }, [fingerprint, photoLibrary]);

  if (isLoading) return (
    <div className='p-5 py-10 min-h-[50vh] flex justify-center items-center'>
      <LoadingIcon className='h-8 w-8 mr-1' />
      <span>Loading library...</span>
    </div>
  )

  if (!fetchOptions) return (
    <div className='p-5 py-10 min-h-[50vh] flex justify-center items-center text-destructive'>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 mr-1">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
      </svg>
      <span>Library not available.</span>
    </div>
  )

  return (
    <PhotosPage
      fetchOptions={fetchOptions}
      pageTitle={`${peer ? peer.deviceName : 'This Device'} - ${photoLibrary?.name}`}
      pageIcon='/icons/photos.png'
    />
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
