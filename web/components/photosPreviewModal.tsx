import * as Dialog from '@radix-ui/react-dialog';
import SharedPhotoModal from './photosPreview'
import { PhotoView } from '@/lib/types'
import { useCallback } from 'react'

export default function PhotosPreviewModal({
  photo,
  photos,
  changePhoto,
}: {
  photo: PhotoView | null,
  photos: PhotoView[],
  changePhoto: (photo: PhotoView | null) => void,
}) {

  const closeModal = useCallback(() => {
    changePhoto(null);
  }, [changePhoto]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      closeModal();
    }
  }, [closeModal]);

  return (
    <Dialog.Root open={!!photo} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content className='fixed top-0 h-screen w-screen z-30 bg-background duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]'>
          {photo && <SharedPhotoModal
            images={photos}
            currentPhoto={photo}
            changePhoto={changePhoto}
            closeModal={closeModal}
          />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
