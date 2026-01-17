import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUturnLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  RectangleStackIcon,
} from '@heroicons/react/24/outline'
import { AnimatePresence, motion, MotionConfig } from 'framer-motion'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import { variants } from '@/lib/animationVariants'
import type { PhotoView } from '@/lib/types'
import LazyImage from './lazyImage'
import { getFileUrl } from '@/lib/fileUtils'
import { toast } from './ui/use-toast'
import { cn, getServiceController, isMacosTheme } from '@/lib/utils'

type ThumbnailPhotoProps = {
  item: PhotoView;
  className?: string;
  height?: number;
  width?: number;
}

type ActionButtonProps = {
  onClick: (e: React.MouseEvent) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function ActionButton({ onClick, title, children, className = '' }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full bg-black/50 p-2 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white ${className}`}
      title={title}
    >
      {children}
    </button>
  );
}

type NavigationButtonProps = {
  direction: 'left' | 'right';
  onClick: () => void;
}

function NavigationButton({ direction, onClick }: NavigationButtonProps) {
  const isLeft = direction === 'left';
  return (
    <button
      className={`absolute z-50 ${isLeft ? 'left-6' : 'right-6'} top-[calc(50%-16px)] rounded-full bg-black/50 p-3 text-white/75 backdrop-blur-lg transition hover:bg-black/75 hover:text-white focus:outline-none`}
      style={{ transform: 'translate3d(0, 0, 0)' }}
      onClick={onClick}
    >
      {isLeft ? (
        <ChevronLeftIcon className="h-5 w-5" />
      ) : (
        <ChevronRightIcon className="h-5 w-5" />
      )}
    </button>
  );
}

function ThumbnailPhoto({ item, className, height, width }: ThumbnailPhotoProps) {
  const dafaultSrc = '/img/blank-tile.png';

  const fetchThumbnailSrc = useCallback(async () => {
    if (item.thumbnail) {
      return item.thumbnail;
    }
    const serviceController = await getServiceController(item.deviceFingerprint);
    item.thumbnail = await serviceController.thumbnail.generateThumbnailURI(item.fileId);
    return item.thumbnail;
  }, [item]);

  return (<LazyImage
    fetchSrc={fetchThumbnailSrc}
    src={dafaultSrc}
    alt={item.id.toString()}
    width={width || 0}
    height={height || 0}
    className={className}
  />)
}

export interface PhotosPreviewProps {
  images?: PhotoView[]
  currentPhoto: PhotoView
  changePhoto: (photo: PhotoView) => void
  closeModal: () => void
  direction?: number
}

export default function PhotosPreview({
  images,
  changePhoto,
  closeModal,
  currentPhoto,
  direction,
}: PhotosPreviewProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [assetUrl, setAssetUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const currentPhotoRef = useRef<PhotoView | null>(null);
  const [showThumbs, setShowThumbs] = useState(true);

  const index = useMemo(() => {
    if (images) {
      return images.findIndex((img: PhotoView) => img.id === currentPhoto.id && img.deviceFingerprint === currentPhoto.deviceFingerprint)
    }
    return 0
  }, [currentPhoto.id, currentPhoto.deviceFingerprint, images])

  const downloadPhoto = useCallback(async () => {
    const deviceFingerprint = currentPhoto.deviceFingerprint;
    const fileId = currentPhoto.fileId;
    toast({
      title: 'Download started',
    });
    try {
      const serviceController = await getServiceController(null);
      await serviceController.files.download(deviceFingerprint, fileId);
      toast({
        title: 'Photo downloaded',
      });
    } catch (e) {
      console.error(e);
      toast({
        variant: "destructive",
        title: 'Could not download photo',
        description: fileId,
      });
    }
  }, [currentPhoto.fileId, currentPhoto.deviceFingerprint]);

  useEffect(() => {
    if (currentPhotoRef.current === currentPhoto) return;
    setIsLoading(true);
    setAssetUrl(null);
    setError(null);
    currentPhotoRef.current = currentPhoto;
    const fetchAssetUrl = async () => {
      if (currentPhoto.assetUrl) {
        setAssetUrl(currentPhoto.assetUrl);
        setIsLoading(false);
        return;
      }
      try {
        const url = getFileUrl(currentPhoto.deviceFingerprint, currentPhoto.fileId);
        if (currentPhotoRef.current !== currentPhoto) return;
        currentPhoto.assetUrl = url;
        setAssetUrl(currentPhoto.assetUrl);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssetUrl();
  }, [currentPhoto]);

  const filteredImages = useMemo(() => {
    if (!images) return null;
    const start = Math.max(index - 15, 0);
    const end = Math.min(index + 15, images.length);
    return images.slice(start, end);
  }, [images, index]);

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (images && index < images.length - 1) {
        changePhoto(images[index + 1])
      }
    },
    onSwipedRight: () => {
      if (images && index > 0) {
        changePhoto(images[index - 1])
      }
    },
    trackMouse: true,
  })

  const isVideo = useMemo(() => {
    if (!currentPhoto.mimeType) return false;
    return currentPhoto.mimeType.startsWith('video/');
  }, [currentPhoto.mimeType]);

  const thumbsButtonClick = useCallback((e: React.MouseEvent) => {
    setShowThumbs((prev) => !prev);
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return (
    <MotionConfig
      transition={{
        x: { type: 'spring', stiffness: 300, damping: 30 },
        opacity: { duration: 0.2 },
      }}
    >
      <div
        className="relative flex w-full items-center h-full"
        {...handlers}
      >
        {/* Main image */}
        <div className="w-full h-full overflow-hidden">
          <div className="relative flex items-center justify-center w-full h-full">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={index}
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                className='absolute inset-0 flex items-center justify-center'
              >
                {error
                  ? (
                    <div className='flex flex-col items-center justify-center'>
                      <ArrowTopRightOnSquareIcon className='h-10 w-10 text-white' />
                      <span className='text-center'>{error}</span>
                    </div>
                  )
                  : isVideo && assetUrl
                    ? (<video
                      src={assetUrl}
                      controls={true}
                      className='h-full max-h-screen w-auto transform transition relative z-50'
                    />)
                    : (<Image
                      src={assetUrl || currentPhoto.thumbnail || '/img/blank-tile.png'}
                      width={0}
                      height={0}
                      className='h-full max-h-screen w-auto object-contain transform transition'
                      priority
                      alt="Preview Image"
                    />)}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Buttons + bottom nav bar */}
        <div className="absolute inset-0 mx-auto flex items-center justify-center">
          {/* Buttons */}
          {!isLoading && (
            <div className="relative h-full w-full">
              {images && (
                <>
                  {index > 0 && (
                    <NavigationButton
                      direction="left"
                      onClick={() => changePhoto(images[index - 1])}
                    />
                  )}
                  {index + 1 < images.length && (
                    <NavigationButton
                      direction="right"
                      onClick={() => changePhoto(images[index + 1])}
                    />
                  )}
                </>
              )}
              <div className={cn(
                "absolute z-50 right-0 flex items-center gap-2 p-6 text-white",
                isMacosTheme() ? 'top-2' : 'top-4'
              )}>
                <ActionButton onClick={downloadPhoto} title="Download fullsize version">
                  <ArrowDownTrayIcon className="h-5 w-5" />
                </ActionButton>
                {filteredImages && filteredImages.length > 0 && (
                  <ActionButton onClick={thumbsButtonClick} title="Toggle Thumbnails">
                    <RectangleStackIcon className="h-5 w-5" />
                  </ActionButton>
                )}
                <ActionButton onClick={() => closeModal()}>
                  {filteredImages ? (
                    <XMarkIcon className="h-5 w-5" />
                  ) : (
                    <ArrowUturnLeftIcon className="h-5 w-5" />
                  )}
                </ActionButton>
              </div>
            </div>
          )}
          {/* Bottom Nav bar */}
          {images && showThumbs && filteredImages && filteredImages.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-50 overflow-hidden bg-gradient-to-b from-black/0 to-black/60">
              <motion.div
                initial={false}
                className="mx-auto mt-6 mb-6 flex aspect-[3/2] h-14"
              >
                <AnimatePresence initial={false}>
                  {filteredImages.map((photo) => (
                    <motion.button
                      initial={{
                        width: '0%',
                        x: `${Math.max((index - 1) * -100, 15 * -100)}%`,
                      }}
                      animate={{
                        scale: photo === currentPhoto ? 1.25 : 1,
                        width: '100%',
                        x: `${Math.max(index * -100, 15 * -100)}%`,
                      }}
                      exit={{ width: '0%' }}
                      onClick={() => changePhoto(photo)}
                      key={`${photo.deviceFingerprint}-${photo.id}`}
                      className={`${photo === currentPhoto
                        ? 'z-20 rounded-md shadow shadow-black/50'
                        : 'z-10'
                        } relative inline-block w-full shrink-0 transform-gpu overflow-hidden focus:outline-none`}
                    >
                      <ThumbnailPhoto
                        width={180}
                        height={120}
                        className={`${photo === currentPhoto
                          ? 'brightness-110 hover:brightness-110'
                          : 'brightness-50 contrast-125 hover:brightness-75'
                          } h-full transform object-cover transition`}
                        item={photo}
                      />
                    </motion.button>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </MotionConfig>
  )
}
