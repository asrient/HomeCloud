import { PhotoView, PhotosFetchOptions } from "@/lib/types";
import Head from "next/head";
import PageBar from "./pageBar";
import { Button } from "./ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listPhotos, deletePhotos } from "@/lib/api/photos";
import Loading from "./ui/loading";
import LazyImage from "./lazyImage";
import { getThumbnail } from "@/lib/api/files";
import { cn, isMobile } from "@/lib/utils";
import { dateToTitle, mergePhotosList, libraryHash, libraryHashFromId } from "@/lib/photoUtils";
import Image from "next/image";
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ConfirmModal from "./confirmModal";
import PhotosPreviewModal from "./photosPreviewModal";
import { useToast } from "./ui/use-toast";
import usePhotosUpdates from "./hooks/usePhotosUpdates";


export type PhotosPageProps = {
    pageTitle: string;
    pageIcon: string;
    fetchOptions: PhotosFetchOptions;
}

const FETCH_LIMIT = 50;

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
        const thumbResp = await getThumbnail(item.storageId, item.fileId);
        item.thumbnail = thumbResp.image;
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
        <>
            {
                sections.map((section) => (
                    <div key={section.title} className='p-3 select-none'>
                        <div className='pb-2 text-md font-bold'>{section.title}</div>
                        <div className={'grid gap-1 ' + gridClasses}>
                            {section.photos.map((photo) => (
                                <div className='w-full aspect-square' key={`${photo.id}-${photo.libraryId}-${photo.storageId}`}>
                                    <ThumbnailPhoto item={photo} {...clickProps} />
                                </div>
                            ))}
                        </div>
                    </div>

                ))
            }
        </>
    )
}

const THROTTLE_DELAY = 1000;

export default function PhotosPage({ pageTitle, pageIcon, fetchOptions }: PhotosPageProps) {
    const [photos, setPhotos] = useState<PhotoView[]>([]);
    const isLoadingRef = useRef(false);
    const [hasMore, setHasMore] = useState<{
        [key: string]: boolean;
    }>({});
    const [error, setError] = useState(null);
    const [zoom, setZoom] = useState(3);
    const [selectMode, setSelectMode] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    const selectedPhotos = useMemo(() => photos.filter(item => item.isSelected), [photos]);
    const selectedCount = useMemo(() => selectedPhotos.length, [selectedPhotos]);
    const [photoForPreview, setPhotoForPreview] = useState<PhotoView | null>(null);
    const { toast } = useToast();
    const { applyUpdates } = usePhotosUpdates({
        setPhotos,
        fetchOptions,
        setHasMore
    });

    const throttleTimerRef = useRef<number | null>(null);
    const toBeMergedRef = useRef<{ [libHash: string]: PhotoView[] }>({});
    const countsRef = useRef<{ [libHash: string]: number }>({});

    const scheduleUpdate = useCallback(() => {
        if (!Object.keys(toBeMergedRef.current).length) return;
        if (throttleTimerRef.current) {
            clearTimeout(throttleTimerRef.current);
        }

        throttleTimerRef.current = window.setTimeout(() => {
            const list = Object.values(toBeMergedRef.current);
            if (!list.length) return;

            setPhotos((prevPhotos) => {
                const { merged, discarded } = mergePhotosList([prevPhotos, ...list], fetchOptions.sortBy, fetchOptions.ascending ?? true);
                const counts: { [libHash: string]: number } = {};
                merged.forEach((p) => {
                    const hash = libraryHashFromId(p.storageId, p.libraryId);
                    counts[hash] = (counts[hash] + 1) || 1;
                });
                countsRef.current = counts;
                toBeMergedRef.current = {};

                (discarded.length > 0) && setHasMore((prev) => {
                    console.log('discarded:', discarded);
                    const newHasMore = { ...prev };
                    discarded.forEach((list) => {
                        if (!list.length) return;
                        const first = list[0];
                        newHasMore[libraryHashFromId(first.storageId, first.libraryId)] = true;
                    });
                    return newHasMore;
                });

                return merged;
            });
        }, THROTTLE_DELAY);

        return () => {
            if (throttleTimerRef.current) {
                clearTimeout(throttleTimerRef.current);
            }
        }
    }, [toBeMergedRef, fetchOptions.ascending, fetchOptions.sortBy]);

    const showSpinner = useMemo(() => {
        const canLoadMore = !!(fetchOptions.libraries.find((lib) => hasMore[libraryHash(lib)] === undefined || hasMore[libraryHash(lib)]));
        //const pendingMerges = !!Object.keys(toBeMerged).length;
        return canLoadMore; // || pendingMerges;
    }, [fetchOptions.libraries, hasMore]);

    const loadPhotos = useCallback(async () => {
        if (isLoadingRef.current) return;
        const libs = fetchOptions.libraries.filter((lib) => (hasMore[libraryHash(lib)] === undefined || hasMore[libraryHash(lib)]) && (toBeMergedRef.current[libraryHash(lib)] === undefined));
        if (!libs.length) return;
        isLoadingRef.current = true;
        setError(null);
        console.log('loading photos', libs, countsRef.current, hasMore);
        const promises = libs.map(async (lib) => {
            try {
                const storagePhotos = await listPhotos({
                    offset: countsRef.current[libraryHash(lib)] || 0,
                    limit: FETCH_LIMIT,
                    sortBy: fetchOptions.sortBy,
                    storageId: lib.storageId,
                    libraryId: lib.id,
                    ascending: fetchOptions.ascending ?? true,
                });
                if (!isLoadingRef.current) return;
                if (toBeMergedRef.current[libraryHash(lib)] !== undefined) return;
                const storagePhotoViews: PhotoView[] = storagePhotos.map((p) => ({
                    ...p,
                    isSelected: false,
                    storageId: lib.storageId,
                    libraryId: lib.id,
                }));
                if (storagePhotoViews.length) {
                    toBeMergedRef.current[libraryHash(lib)] = storagePhotoViews;
                    scheduleUpdate();
                }
                setHasMore((prev) => ({ ...prev, [libraryHash(lib)]: storagePhotos.length === FETCH_LIMIT }));
            } catch (err: any) {
                //setError(err.message);
                if (!isLoadingRef.current) return;
                console.error(err);
                toast({
                    type: 'foreground',
                    title: `Could not get photos for lib: ${libraryHash(lib)}`,
                    description: err.message,
                    color: 'red',
                });
            }
        });
        await Promise.allSettled(promises);
        isLoadingRef.current = false;
    }, [fetchOptions.ascending, fetchOptions.libraries, fetchOptions.sortBy, hasMore, scheduleUpdate, toast]);

    const [currentFetchOptions, setCurrentFetchOptions] = useState<PhotosFetchOptions>(fetchOptions);
    useEffect(() => {
        const currentLibHashes = currentFetchOptions.libraries.map(libraryHash);
        const newLibHashes = fetchOptions.libraries.map(libraryHash);
        const hasChanged = (
            currentFetchOptions.sortBy !== fetchOptions.sortBy ||
            currentFetchOptions.ascending !== fetchOptions.ascending ||
            currentFetchOptions.libraries.length !== fetchOptions.libraries.length ||
            currentLibHashes.some((id) => !newLibHashes.includes(id))
        );
        if (hasChanged) {
            console.log('Fetch options changed, resetting photos..');
            isLoadingRef.current = false;
            setPhotos([]);
            setHasMore({});
            toBeMergedRef.current = {};
            countsRef.current = {};
            setCurrentFetchOptions(fetchOptions);
        }
    }, [currentFetchOptions.ascending, currentFetchOptions.libraries, currentFetchOptions.sortBy, fetchOptions, isLoadingRef]);

    const fetchNew = useCallback(async () => {
        console.log('fetchNew')
        await loadPhotos();
    }, [loadPhotos]);

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
            if (p.id === item.id && p.storageId === item.storageId && p.libraryId === item.libraryId) {
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
    }, [selectMode]);

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
    }, []);

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
        const delMap = new Map<string, { ids: number[]; storageId: number; libraryId: number; }>();
        selectedPhotos.forEach((p) => {
            const libHash = libraryHashFromId(p.storageId, p.libraryId);
            const photos = delMap.get(libHash) ?? { ids: [], storageId: p.storageId, libraryId: p.libraryId };
            photos.ids.push(p.id);
            delMap.set(libHash, photos);
        });
        const promises: Promise<void>[] = [];
        const errors: string[] = [];
        delMap.forEach((del) => {
            promises.push((async () => {
                try {
                    const res = await deletePhotos(del);
                    applyUpdates({
                        add: [],
                        update: {},
                        delete: res.deletedIds,
                    }, del.storageId, del.libraryId);
                } catch (err: any) {
                    errors.push(err.message);
                }
            })());
        });
        await Promise.allSettled(promises);
        if (errors.length) {
            console.error('photos delete errors:', errors);
            throw new Error(errors.join('\n'));
        }
    }, [applyUpdates, selectedCount, selectedPhotos]);

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
    }, []);

    return (
        <>
            <Head>
                <title>{`${pageTitle} - Photos`}</title>
            </Head>
            <main>
                <PhotosPreviewModal
                    photos={photos}
                    photo={photoForPreview}
                    changePhoto={(photo) => setPhotoForPreview(photo)}
                />
                <PageBar title={pageTitle} icon={pageIcon}>
                    <Button title='Toggle select mode' onClick={toggleSelectMode} variant={selectMode ? 'secondary' : 'ghost'} size='icon'>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </Button>
                    <Button variant='ghost' title='Zoom In' size='icon' disabled={zoom >= 4} onClick={zoomIn}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                        </svg>
                    </Button>
                    <Button variant='ghost' title='Zoom Out' size='icon' disabled={zoom <= 1} onClick={zoomOut}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                        </svg>
                    </Button>
                </PageBar>
                <ContextMenu>
                    <ContextMenuTrigger>
                        <div
                            onClick={onClickOutside}
                            onContextMenu={onRightClickOutside}
                            className='min-h-[90vh]'
                        >
                            <TimeBasedGrid
                                dateKey={fetchOptions.sortBy}
                                photos={photos}
                                size={zoom}
                                onClick={onClick}
                                onDoubleClick={onDoubleClick}
                                onRightClick={onRightClick}
                            />
                            {
                                !error && !showSpinner && !photos.length && <div className='p-5 py-10 min-h-[50vh] flex flex-col justify-center items-center'>
                                    <Image src='/img/purr-remote-work.png' alt='No Photos' className='w-[14rem] h-auto max-w-[80vw]' priority width={0} height={0} />
                                    <div className='text-lg font-semibold'>Nothing to see here, except for the cat.</div>
                                </div>
                            }
                            {error && !showSpinner && <div className='p-5 py-10 flex justify-center items-center text-red-500'>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                                <span className='ml-2 text-sm'>{error}</span>
                            </div>}
                            {!error && showSpinner && <div className='p-5 py-10 flex justify-center items-center'>
                                <Loading onVisible={fetchNew} />
                            </div>}
                            {
                                !error && !showSpinner && photos.length > 0 && <div className='p-5 py-10 flex justify-center items-center text-gray-500'>
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
            </main>
        </>
    )
}
