import { AppName, PhotoView } from "@/lib/types";
import Head from "next/head";
import PageBar from "./pageBar";
import UploadFileSelector from "./uploadFileSelector";
import { Button } from "./ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listPhotos, uploadPhotos } from "@/lib/api/photos";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import useFilterStorages from "./hooks/useFilterStorages";
import Loading from "./ui/loading";
import LazyImage from "./lazyImage";
import { getThumbnail } from "@/lib/api/files";
import { cn } from "@/lib/utils";
import { dateToTitle } from "@/lib/photoUtils";
import Image from "next/image";
import usePhotosEvents from "./hooks/usePhotosEvents";

export type FetchOptions = {
    sortBy: 'capturedOn' | 'addedOn';
    ascending?: boolean;
    storageIds: number[];
}

export type PhotosPageProps = {
    pageTitle: string;
    pageIcon: string;
    fetchOptions: FetchOptions;
}

const FETCH_LIMIT = 1000;

function ThumbnailPhoto({ item, className }: { item: PhotoView, className?: string }) {
    const dafaultSrc = '/img/blank-tile.png';

    const fetchThumbnailSrc = useCallback(async () => {
        if (item.thumbnail) {
            return item.thumbnail;
        }
        const thumbResp = await getThumbnail(item.storageId, item.fileId);
        item.thumbnail = thumbResp.image;
        return item.thumbnail;
    }, [item]);

    return (<LazyImage
        fetchSrc={fetchThumbnailSrc}
        src={dafaultSrc}
        alt={item.itemId.toString()}
        width="0"
        height="0"
        className={cn("h-full w-full object-cover", className)}
    />)
}

type PhotoSection = {
    title: string;
    photos: PhotoView[];
}

function TimeBasedGrid({ photos, size, dateKey }: { photos: PhotoView[], size: number, dateKey: 'capturedOn' | 'addedOn' }) {
    const gridClasses = useMemo(() => {
        switch (size) {
            case 1:
                return 'grid-cols-9 md:grid-cols-12 lg:grid-cols-16';
            case 2:
                return 'grid-cols-7 md:grid-cols-9 lg:grid-cols-12';
            case 3:
                return 'grid-cols-5 md:grid-cols-7 lg:grid-cols-9';
            case 4:
                return 'grid-cols-3 md:grid-cols-5 lg:grid-cols-6';
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
                    <div key={section.title} className='p-3'>
                        <div className='pb-2 text-md font-bold'>{section.title}</div>
                        <div className={'grid gap-1 ' + gridClasses}>
                            {section.photos.map((photo) => (
                                <div className='w-full aspect-square' key={`${photo.itemId}-${photo.storageId}`}>
                                    <ThumbnailPhoto item={photo} />
                                </div>
                            ))}
                        </div>
                    </div>

                ))
            }
        </>
    )
}

export default function PhotosPage({ pageTitle, pageIcon, fetchOptions }: PhotosPageProps) {
    const [photos, setPhotos] = useState<PhotoView[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState(null);
    const [selectedStorageId, setSelectedStorageId] = useState<number | null>(null);
    const activeStorages = useFilterStorages(AppName.Photos);
    const [zoom, setZoom] = useState(3);

    usePhotosEvents({
        photos,
        setPhotos,
        sortKey: !fetchOptions.ascending && ['capturedOn', 'addedOn'].includes(fetchOptions.sortBy) ? fetchOptions.sortBy : null,
        setHasMore,
    });

    const enabledStorages = useMemo(() => {
        return activeStorages.filter((storage) => fetchOptions.storageIds.includes(storage.id));
    }, [activeStorages, fetchOptions.storageIds]);

    const loadPhotos = useCallback(async () => {
        if (isLoading || !hasMore) return;
        setIsLoading(true);
        setError(null);
        try {
            const photos_ = await listPhotos({
                offset: photos.length,
                limit: FETCH_LIMIT,
                sortBy: fetchOptions.sortBy,
                storageIds: fetchOptions.storageIds,
                ascending: fetchOptions.ascending ?? true,
            });
            const photoViews = photos_.map((p) => ({
                ...p,
                isSelected: false,
            }));
            setPhotos((prevPhotos) => [...prevPhotos, ...photoViews]);
            setHasMore(photos.length === FETCH_LIMIT);
            return photoViews;
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [fetchOptions.ascending, fetchOptions.sortBy, fetchOptions.storageIds, hasMore, isLoading, photos.length]);

    const [currentFetchOptions, setCurrentFetchOptions] = useState<FetchOptions>(fetchOptions);
    useEffect(() => {
        const hasChanged = (
            currentFetchOptions.sortBy !== fetchOptions.sortBy ||
            currentFetchOptions.ascending !== fetchOptions.ascending ||
            currentFetchOptions.storageIds.length !== fetchOptions.storageIds.length ||
            currentFetchOptions.storageIds.some((id) => !fetchOptions.storageIds.includes(id))
        );
        if (hasChanged && !isLoading) {
            setPhotos([]);
            setHasMore(true);
            setCurrentFetchOptions(fetchOptions);
        }
    }, [currentFetchOptions.ascending, currentFetchOptions.sortBy, currentFetchOptions.storageIds, fetchOptions, isLoading]);

    const fetchNew = useCallback(async () => {
        console.log('fetchNew')
        await loadPhotos();
    }, [loadPhotos]);

    const onUpload = useCallback(async (files: FileList) => {
        if (!selectedStorageId) throw new Error('Please select a storage.');
        await uploadPhotos(selectedStorageId, files);
    }, [selectedStorageId])

    const handleStorageSelect = useCallback((storageId: string | null) => {
        setSelectedStorageId(storageId ? parseInt(storageId) : null);
    }, []);

    const zoomIn = useCallback(() => {
        if (zoom >= 4) return;
        setZoom(zoom + 1);
    }, [zoom]);

    const zoomOut = useCallback(() => {
        if (zoom <= 1) return;
        setZoom(zoom - 1);
    }, [zoom]);

    return (
        <>
            <Head>
                <title>{`${pageTitle} - Photos`}</title>
            </Head>
            <main>
                <PageBar title={pageTitle} icon={pageIcon}>
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
                    <UploadFileSelector
                        onUpload={onUpload}
                        title='Upload Photos'
                        accept='image/*, video/*'
                        embedComponent={
                            <Select
                                onValueChange={handleStorageSelect}
                                value={selectedStorageId?.toString()}
                            >
                                <SelectTrigger className="w-[10rem]">
                                    <SelectValue placeholder="Select storage" />
                                </SelectTrigger>
                                <SelectContent>
                                    {
                                        enabledStorages.map((storage) => (
                                            <SelectItem key={storage.id} value={storage.id.toString()}>
                                                {storage.name}
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        }
                    >
                        <Button variant='ghost'>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                            </svg>
                        </Button>
                    </UploadFileSelector>
                </PageBar>
                <TimeBasedGrid dateKey={fetchOptions.sortBy} photos={photos} size={zoom} />
                {
                    !error && !isLoading && !hasMore && !photos.length && <div className='p-5 py-10 min-h-[50vh] flex flex-col justify-center items-center'>
                        <Image src='/img/purr-remote-work.png' alt='No Photos' className='w-[14rem] h-auto max-w-[80vw]' width={0} height={0} />
                        <div className='text-lg font-semibold'>No Photos.</div>
                    </div>
                }
                {error && <div className='p-5 py-10 flex justify-center items-center text-red-500'>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span className='ml-2 text-sm'>{error}</span>
                </div>}
                {!error && !isLoading && hasMore && <div className='p-5 py-10 flex justify-center items-center'>
                    <Loading onVisible={fetchNew} />
                </div>}
                {
                    !error && !isLoading && !hasMore && photos.length > 0 && <div className='p-5 py-10 flex justify-center items-center text-gray-500'>
                        <span className='text-sm font-medium'>{photos.length} photo(s).</span>
                    </div>
                }
            </main>
        </>
    )
}
