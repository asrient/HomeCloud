import { PhotoView, PhotosFetchOptions } from "@/lib/types";
import Head from "next/head";
import {MenuButton, MenuGroup, PageBar, PageContent} from "./pagePrimatives";
import { Button } from "./ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Loading from "./ui/loading";
import LazyImage from "./lazyImage";
import { cn, getServiceController, isMacosTheme, isMobile } from "@/lib/utils";
import { dateToTitle } from "@/lib/photoUtils";
import Image from "next/image";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ConfirmModal from "./confirmModal";
import PhotosPreviewModal from "./photosPreviewModal";
import { usePhotos } from "./hooks/usePhotos";
import { ThemedIconName } from "@/lib/enums";

export type PhotosPageProps = {
    pageTitle: string;
    pageIcon: ThemedIconName;
    fetchOptions: PhotosFetchOptions;
}

type ClickProps = {
    onClick: (item: PhotoView, e: React.MouseEvent) => void;
    onDoubleClick: (item: PhotoView, e: React.MouseEvent) => void;
    onRightClick: (item: PhotoView, e: React.MouseEvent) => void;
}

type ThumbnailPhotoProps = {
    item: PhotoView;
    className?: string;
} & ClickProps;

function ThumbnailPhoto({ item, className, onClick, onDoubleClick, onRightClick }: ThumbnailPhotoProps) {
    const dafaultSrc = '/img/blank-tile.png';

    const fetchThumbnailSrc = useCallback(async () => {
        if (item.thumbnail) {
            return item.thumbnail;
        }
        const serviceController = await getServiceController(item.deviceFingerprint);
        item.thumbnail = await serviceController.thumbnail.generateThumbnailURI(item.fileId);
        return item.thumbnail;
    }, [item]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        onDoubleClick(item, e);
    }, [item, onDoubleClick]);

    const handleRightClick = useCallback((e: React.MouseEvent) => {
        onRightClick(item, e);
    }, [item, onRightClick]);

    const handleOnClick = useCallback((e: React.MouseEvent) => {
        onClick(item, e);
    }, [item, onClick]);

    return (<LazyImage
        fetchSrc={fetchThumbnailSrc}
        src={dafaultSrc}
        alt={item.id.toString()}
        onClick={handleOnClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        width="0"
        height="0"
        className={cn("photoThumbnail h-full w-full object-cover transform dark:brightness-90 brightness-105 transition will-change-auto dark:hover:brightness-110 hover:brightness-75",
            className,
            item.isSelected && 'ring-4 ring-blue-600 opacity-80')}
    />)
}

type PhotoSection = {
    title: string;
    photos: PhotoView[];
}

type TimeBasedGridProps = {
    photos: PhotoView[];
    size: number;
    dateKey: 'capturedOn' | 'addedOn';
} & ClickProps;

function TimeBasedGrid({ photos, size, dateKey, ...clickProps }: TimeBasedGridProps) {
    const gridClasses = useMemo(() => {
        switch (size) {
            case 1:
                return 'grid-cols-9 md:grid-cols-12 lg:grid-cols-16 xl:grid-cols-18';
            case 2:
                return 'grid-cols-7 md:grid-cols-9 lg:grid-cols-11 xl:grid-cols-12';
            case 3:
                return 'grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 lg:gap-1';
            case 4:
                return 'grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-1';
            default:
                return 'grid-cols-1';
        }
    }, [size]);

    const sections: PhotoSection[] = useMemo(() => {
        const sections: PhotoSection[] = [];
        let currentSection: PhotoSection | null = null;
        const today = new Date();
        photos.forEach((photo) => {
            const date = new Date(photo[dateKey]);
            const sectionTitle = dateToTitle(date, size <= 2 ? 'month' : 'day', today);
            if (!currentSection || currentSection.title !== sectionTitle) {
                currentSection = {
                    title: sectionTitle,
                    photos: [],
                };
                sections.push(currentSection);
            }
            currentSection.photos.push(photo);
        });
        return sections;
    }, [photos, dateKey, size]);

    return (
        <div  className='px-3 select-none'>
            {
                sections.map((section) => (
                    <div key={section.title}>
                        <div className={cn('font-medium sticky z-10 top-0',
                            isMacosTheme() ? 'text-md p-1 max-w-max' : 'text-sm py-3 bg-background px-3'
                        )}>
                            <div className={cn(isMacosTheme() && 'px-3 py-2 backdrop-blur-xl rounded-lg')} >
                            {section.title}
                            </div>
                        </div>
                        <div className={'relative grid gap-1 ' + gridClasses}>
                            {section.photos.map((photo) => (
                                <div className='w-full aspect-square' key={`${photo.id}_${photo.libraryId}`}>
                                    <ThumbnailPhoto item={photo} {...clickProps} />
                                </div>
                            ))}
                        </div>
                    </div>
                ))
            }
        </div>
    )
}

export default function PhotosPage({ pageTitle, pageIcon, fetchOptions }: PhotosPageProps) {
    const [zoom, setZoom] = useState(3);
    const [selectMode, setSelectMode] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const { photos, setPhotos, hasMore, isLoading, error, load } = usePhotos(fetchOptions);

    const selectedPhotos = useMemo(() => photos.filter(item => item.isSelected), [photos]);
    const selectedCount = useMemo(() => selectedPhotos.length, [selectedPhotos]);
    const [photoForPreview, setPhotoForPreview] = useState<PhotoView | null>(null);

    const fetchNew = useCallback(async () => {
        console.log('fetchNew')
        await load();
    }, [load]);

    const zoomIn = useCallback(() => {
        if (zoom >= 4) return;
        setZoom(zoom + 1);
    }, [zoom]);

    const zoomOut = useCallback(() => {
        if (zoom <= 1) return;
        setZoom(zoom - 1);
    }, [zoom]);

    const selectPhoto = useCallback((item: PhotoView, toggle = true, persistSelection?: boolean) => {
        const persistSelection_ = selectMode || persistSelection;
        setPhotos((prevPhotos) => prevPhotos.map((p) => {
            if (p.id === item.id && p.deviceFingerprint === item.deviceFingerprint && p.libraryId === item.libraryId) {
                return {
                    ...p,
                    isSelected: toggle ? !p.isSelected : true,
                }
            }
            if (persistSelection_) {
                return p;
            }
            return { ...p, isSelected: false };
        }));
    }, [selectMode, setPhotos]);

    const previewPhoto = useCallback((item: PhotoView) => {
        setPhotoForPreview(item);
    }, []);

    const onClick = useCallback((item: PhotoView, e: React.MouseEvent) => {
        const isShift = e.shiftKey;
        e.stopPropagation();
        if (!isMobile() || selectMode) {
            selectPhoto(item, true, isShift);
        } else {
            previewPhoto(item);
        }
    }, [previewPhoto, selectMode, selectPhoto]);

    const onDoubleClick = useCallback((item: PhotoView, e: React.MouseEvent) => {
        previewPhoto(item);
    }, [previewPhoto]);

    const onRightClick = useCallback((item: PhotoView, e: React.MouseEvent) => {
        selectPhoto(item, false, true);
    }, [selectPhoto]);

    const onClickOutside = useCallback(() => {
        setPhotos((prevPhotos) => prevPhotos.map((p) => {
            if (!p.isSelected) return p;
            return {
                ...p,
                isSelected: false,
            }
        }));
    }, [setPhotos]);

    const onRightClickOutside = useCallback((e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && e.target.closest('.photoThumbnail')) return;
        onClickOutside()
    }, [onClickOutside])

    const previewSelected = useCallback(() => {
        if (selectedCount !== 1) return;
        const selectedPhoto = selectedPhotos[0];
        previewPhoto(selectedPhoto);
    }, [previewPhoto, selectedCount, selectedPhotos]);

    const deleteSelected = useCallback(async () => {
        if (!selectedCount) return;
        const idsToDel = selectedPhotos.map((p) => p.id);
        const serviceController = await getServiceController(fetchOptions.deviceFingerprint);
        const { deletedIds } = await serviceController.photos.deletePhotos(fetchOptions.library.id, idsToDel);
        setPhotos((prevPhotos) => prevPhotos.filter((p) => !deletedIds.includes(p.id)));
        setDeleteDialogOpen(false);
    }, [fetchOptions.deviceFingerprint, fetchOptions.library.id, selectedCount, selectedPhotos, setPhotos]);

    const openDeleteDialog = useCallback(() => {
        setDeleteDialogOpen(true);
    }, []);

    const toggleSelectMode = useCallback(() => {
        setSelectMode((prev) => !prev);
    }, []);

    const selectAll = useCallback(() => {
        setPhotos((prevPhotos) => prevPhotos.map((p) => ({
            ...p,
            isSelected: true,
        })));
    }, [setPhotos]);

    return (
        <>
            <Head>
                <title>{pageTitle}</title>
            </Head>
            
                <PhotosPreviewModal
                    photos={photos}
                    photo={photoForPreview}
                    changePhoto={(photo) => setPhotoForPreview(photo)}
                />
                <PageBar title={pageTitle} icon={pageIcon}>
                    <MenuGroup>
                    <MenuButton title='Toggle select mode' onClick={toggleSelectMode} selected={selectMode}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </MenuButton>
                    </MenuGroup>
                    <MenuGroup>
                    <MenuButton title='Zoom In' disabled={zoom >= 4} onClick={zoomIn}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                        </svg>
                    </MenuButton>
                    <MenuButton title='Zoom Out' disabled={zoom <= 1} onClick={zoomOut}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                        </svg>
                    </MenuButton>
                    </MenuGroup>
                </PageBar>
                <PageContent>
                <ContextMenu>
                    <ContextMenuTrigger>
                        <div
                            onClick={onClickOutside}
                            onContextMenu={onRightClickOutside}
                            className='min-h-[90vh]'
                        >
                            <div className={cn(!isMacosTheme() && 'px-7')}>
                            <TimeBasedGrid
                                dateKey={fetchOptions.sortBy}
                                photos={photos}
                                size={zoom}
                                onClick={onClick}
                                onDoubleClick={onDoubleClick}
                                onRightClick={onRightClick}
                            />
                            </div>
                            {
                                !error && !hasMore && !photos.length && <div className='p-5 py-10 min-h-[50vh] flex flex-col justify-center items-center'>
                                    <Image src='/img/purr-remote-work.png' alt='No Photos' className='w-[14rem] h-auto max-w-[80vw]' priority width={0} height={0} />
                                    <div className='text-lg font-semibold'>Nothing to see here, except for the cat.</div>
                                </div>
                            }
                            {error && !hasMore && <div className='p-5 py-10 flex justify-center items-center text-red-500'>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                <span className='ml-2 text-sm'>{error}</span>
                            </div>}
                            {!error && hasMore && <div className='p-5 py-10 flex justify-center items-center'>
                                <Loading onVisible={fetchNew} />
                            </div>}
                            {
                                !error && !hasMore && photos.length > 0 && <div className='p-5 py-10 flex justify-center items-center text-gray-500'>
                                    <span className='text-sm font-medium'>{photos.length} photo(s).</span>
                                </div>
                            }
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        {
                            selectedCount === 0 && (
                                <>
                                    <ContextMenuItem disabled>Paste</ContextMenuItem>
                                    <ContextMenuItem onClick={selectAll}>Select all</ContextMenuItem>
                                </>
                            )
                        }
                        {
                            selectedCount === 1 && (
                                <ContextMenuItem onClick={previewSelected}>
                                    Preview
                                </ContextMenuItem>
                            )
                        }
                        {
                            selectedCount > 0 && (
                                <>
                                    <ContextMenuItem disabled>Copy</ContextMenuItem>
                                    <ContextMenuItem disabled>Cut</ContextMenuItem>
                                    <ContextMenuItem onClick={openDeleteDialog} className='text-red-500'>
                                        {`Delete ${selectedCount === 1 ? 'photo' : `(${selectedCount}) photos`}`}
                                    </ContextMenuItem>
                                </>
                            )
                        }
                    </ContextMenuContent>
                </ContextMenu>
                <ConfirmModal isOpen={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}
                    title={selectedCount > 1 ? `Delete (${selectedCount}) Photos?` : `Delete Photo?`}
                    description='These photos(s) will be deleted from the remote storage. You may not be able to recover them.'
                    buttonText='Delete'
                    buttonVariant='destructive'
                    onConfirm={deleteSelected}>
                </ConfirmModal>
            </PageContent>
        </>
    )
}
