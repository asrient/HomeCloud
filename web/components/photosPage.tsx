import { PhotoView, PhotosFetchOptions } from "@/lib/types";
import Head from "next/head";
import { MenuButton, MenuGroup, PageBar, PageContent } from "./pagePrimatives";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Loading from "./ui/loading";
import LazyImage from "./lazyImage";
import { cn, getServiceController, isMacos, isMacosTheme, isMobile } from "@/lib/utils";
import { dateToTitle } from "@/lib/photoUtils";
import Image from "next/image";
import { ContextMenuArea } from "./contextMenuArea";
import { ContextMenuItem } from "@/lib/types";
import ConfirmModal from "./confirmModal";
import PhotosPreviewModal from "./photosPreviewModal";
import { usePhotos } from "./hooks/usePhotos";
import { ThemedIconName } from "@/lib/enums";
import { Grid } from 'react-window';
import { useAppState } from "./hooks/useAppState";
import { setItemsToCopy } from "@/lib/fileUtils";

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
    isSelected: boolean;
    className?: string;
    maintainAspectRatio?: boolean;
} & ClickProps;

function formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function ThumbnailPhoto({ item, isSelected, className, maintainAspectRatio, onClick, onDoubleClick, onRightClick }: ThumbnailPhotoProps) {
    const dafaultSrc = '/img/blank-tile.png';
    const isVideo = item.mimeType?.startsWith('video/');

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

    return (
        <div className={cn("relative h-full w-full")}>
            <LazyImage
                fetchSrc={fetchThumbnailSrc}
                src={dafaultSrc}
                alt={item.id.toString()}
                onClick={handleOnClick}
                onDoubleClick={handleDoubleClick}
                onContextMenu={handleRightClick}
                width="0"
                height="0"
                style={{ objectFit: maintainAspectRatio ? 'contain' : 'cover' }}
                className={cn("photoThumbnail h-full w-full transform dark:brightness-90 brightness-105 transition will-change-auto dark:hover:brightness-110 hover:brightness-75",
                    className,
                    isSelected && 'border-4 border-primary opacity-80')}
            />
            {isVideo && item.duration > 0 && (
                <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
                    {formatDuration(item.duration)}
                </div>
            )}
        </div>
    )
}

type PhotoGridProps = {
    photos: PhotoView[];
    selectedIds: Set<string>;
    size: number;
    dateKey: 'capturedOn' | 'addedOn';
    containerHeight: number;
    hasMore: boolean;
    isLoading: boolean;
    onLoadMore: () => void;
    maintainAspectRatio?: boolean;
} & ClickProps;

// Hardcoded columns for each zoom level at different viewport widths
function getColumnsForZoom(zoom: number, containerWidth: number): number {
    // Breakpoints: sm < 640, md >= 768, lg >= 1024, xl >= 1280
    const isXl = containerWidth >= 1280;
    const isLg = containerWidth >= 1024;
    const isMd = containerWidth >= 768;

    switch (zoom) {
        case 1:
            if (isXl) return 16;
            if (isLg) return 14;
            if (isMd) return 10;
            return 7;
        case 2:
            if (isXl) return 12;
            if (isLg) return 10;
            if (isMd) return 8;
            return 5;
        case 3:
            if (isXl) return 8;
            if (isLg) return 7;
            if (isMd) return 5;
            return 4;
        case 4:
            if (isXl) return 6;
            if (isLg) return 5;
            if (isMd) return 4;
            return 3;
        default:
            return 5;
    }
}

function getPhotoKey(photo: PhotoView): string {
    return `${photo.id}-${photo.deviceFingerprint}-${photo.libraryId}`;
}

function PhotoGrid({ photos, selectedIds, size, dateKey, containerHeight, hasMore, isLoading, onLoadMore, maintainAspectRatio, ...clickProps }: PhotoGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);
    const [currentSectionTitle, setCurrentSectionTitle] = useState<string | null>(null);

    // Observe container width changes
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // On macos, scrollbars overlay content, so no need to subtract width
        // on other OS, we subtract a fixed width to account for scrollbar
        const scrollBarWidth = isMacosTheme() ? 0 : 15;

        const updateWidth = () => {
            const width = container.offsetWidth - scrollBarWidth;
            if (width > 0) {
                setContainerWidth(width);
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            updateWidth();
        });

        resizeObserver.observe(container);
        updateWidth();

        return () => resizeObserver.disconnect();
    }, []);

    const columnCount = useMemo(
        () => getColumnsForZoom(size, containerWidth),
        [size, containerWidth]
    );

    // Calculate cell size - each cell is square (width = height)
    // Grid positions cells without gaps, so we use padding inside cells for spacing
    const cellSize = containerWidth > 0 ? Math.floor(containerWidth / columnCount) : 0;

    // Total items = photos + 1 loader/footer row (spanning full width)
    const totalPhotos = photos.length;
    const rowCount = Math.ceil(totalPhotos / columnCount) + (hasMore || totalPhotos > 0 ? 1 : 0);

    // Set initial section title
    useEffect(() => {
        if (photos.length > 0) {
            const date = new Date(photos[0][dateKey]);
            setCurrentSectionTitle(dateToTitle(date, size <= 2 ? 'month' : 'day', new Date()));
        }
    }, [photos, dateKey, size]);

    // Handle visible cells to update date indicator
    const handleCellsRendered = useCallback((visibleCells: { rowStartIndex: number; rowStopIndex: number; columnStartIndex: number; columnStopIndex: number }) => {
        const { rowStartIndex } = visibleCells;
        const photoIndex = rowStartIndex * columnCount;
        if (photoIndex < photos.length) {
            const photo = photos[photoIndex];
            const date = new Date(photo[dateKey]);
            setCurrentSectionTitle(dateToTitle(date, size <= 2 ? 'month' : 'day', new Date()));
        }
    }, [photos, columnCount, dateKey, size]);

    type CellProps = {
        photos: PhotoView[];
        selectedIds: Set<string>;
        columnCount: number;
        hasMore: boolean;
        totalPhotos: number;
        clickProps: ClickProps;
        onLoadMore: () => void;
        maintainAspectRatio?: boolean;
    };

    const CellComponent = useCallback(({
        rowIndex,
        columnIndex,
        style,
        photos,
        selectedIds,
        columnCount,
        hasMore,
        totalPhotos,
        clickProps,
        onLoadMore,
        maintainAspectRatio,
    }: {
        rowIndex: number;
        columnIndex: number;
        style: React.CSSProperties;
    } & CellProps) => {
        const photoIndex = rowIndex * columnCount + columnIndex;
        const isLastRow = rowIndex === Math.ceil(totalPhotos / columnCount);

        // Last row: loader or footer (only render in first column, spanning conceptually)
        if (isLastRow) {
            if (columnIndex === 0) {
                if (hasMore) {
                    return (
                        <div style={style} className='flex justify-center items-center'>
                            <Loading onVisible={onLoadMore} />
                        </div>
                    );
                }
            }
            return null;
        }

        // No photo at this index
        if (photoIndex >= totalPhotos) {
            return null;
        }

        const photo = photos[photoIndex];
        const isSelected = selectedIds.has(getPhotoKey(photo));
        return (
            <div style={style} className="p-[2px]">
                <ThumbnailPhoto item={photo} isSelected={isSelected} maintainAspectRatio={maintainAspectRatio} {...clickProps} />
            </div>
        );
    }, []);

    const cellProps = useMemo((): CellProps => ({
        photos,
        selectedIds,
        columnCount,
        hasMore,
        totalPhotos,
        clickProps,
        onLoadMore,
        maintainAspectRatio,
    }), [photos, selectedIds, columnCount, hasMore, totalPhotos, clickProps, onLoadMore, maintainAspectRatio]);

    const getRowHeight = useCallback((index: number): number => {
        const isLastRow = index === Math.ceil(totalPhotos / columnCount);
        if (isLastRow) {
            return 80; // loader/footer height
        }
        return cellSize; // Same as column width for square cells
    }, [totalPhotos, columnCount, cellSize]);

    if (photos.length === 0 || containerWidth === 0) {
        return <div ref={containerRef} className='select-none w-full h-full' />;
    }

    return (
        <div ref={containerRef} className='select-none w-full relative'>
            {/* Fixed date indicator */}
            {currentSectionTitle && (
                <div className={cn(
                    'absolute top-2 left-4 z-20 font-medium pointer-events-none text-sm px-3 py-2 ',
                    isMacosTheme()
                        ? 'backdrop-blur-xl bg-background/70 rounded-lg shadow-sm'
                        : 'bg-background/90 rounded-md shadow-sm'
                )}>
                    {currentSectionTitle}
                </div>
            )}
            <Grid<CellProps>
                cellComponent={CellComponent}
                cellProps={cellProps}
                columnCount={columnCount}
                columnWidth={cellSize}
                rowCount={rowCount}
                rowHeight={getRowHeight}
                overscanCount={3}
                onCellsRendered={handleCellsRendered}
                style={{ height: containerHeight, width: '100%' }}
            />
        </div>
    );
}

export default function PhotosPage({ pageTitle, pageIcon, fetchOptions }: PhotosPageProps) {
    const [zoom, setZoom] = useState(3);
    const [selectMode, setSelectMode] = useState(false);
    const [maintainAspectRatio, setMaintainAspectRatio] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [containerHeight, setContainerHeight] = useState(600);
    const contentContainerRef = useRef<HTMLDivElement>(null);
    // Use a ref to track the right-clicked item to avoid stale closure issues
    const rightClickedItemRef = useRef<PhotoView | null>(null);

    const { photos, setPhotos, hasMore, isLoading, error, load } = usePhotos(fetchOptions);

    const { peers } = useAppState();

    // Observe content container height
    useEffect(() => {
        const container = contentContainerRef.current;
        if (!container) return;

        const updateHeight = () => {
            // Get available height (viewport height minus page bar and padding)
            const rect = container.getBoundingClientRect();
            const availableHeight = window.innerHeight - rect.top - (isMacosTheme() ? 4 : 10);
            setContainerHeight(Math.max(400, availableHeight));
        };

        const resizeObserver = new ResizeObserver(updateHeight);
        resizeObserver.observe(container);
        updateHeight();
        window.addEventListener('resize', updateHeight);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const selectedCount = selectedIds.size;
    const selectedPhotos = useMemo(() => photos.filter(p => selectedIds.has(getPhotoKey(p))), [photos, selectedIds]);
    const [photoForPreview, setPhotoForPreview] = useState<PhotoView | null>(null);

    const getCurrentSelectedItems = useCallback((): PhotoView[] => {
        const items = [...selectedPhotos];
        const rightClickedItem = rightClickedItemRef.current;
        if (rightClickedItem !== null) {
            // Ensure the right-clicked item is included
            const isAlreadyIncluded = items.find(i => i.id === rightClickedItem.id);
            if (!isAlreadyIncluded) {
                items.push(rightClickedItem);
            }
        }
        return items;
    }, [selectedPhotos]);

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
        const key = getPhotoKey(item);

        setSelectedIds((prev) => {
            const next = persistSelection_ ? new Set(prev) : new Set<string>();
            if (toggle && prev.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
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

    const onClickOutside = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    const onRightClickOutside = useCallback((e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && e.target.closest('.photoThumbnail')) return;
        onClickOutside()
    }, [onClickOutside])

    const deleteSelected = useCallback(async () => {
        if (!selectedCount) return;
        const idsToDel = selectedPhotos.map((p) => p.id);
        const serviceController = await getServiceController(fetchOptions.deviceFingerprint);
        const { deletedIds } = await serviceController.photos.deletePhotos(fetchOptions.library.id, idsToDel);
        setPhotos((prevPhotos) => prevPhotos.filter((p) => !deletedIds.includes(p.id)));
        setSelectedIds(new Set());
        setDeleteDialogOpen(false);
    }, [fetchOptions.deviceFingerprint, fetchOptions.library.id, selectedCount, selectedPhotos, setPhotos]);

    const openDeleteDialog = useCallback(() => {
        setDeleteDialogOpen(true);
    }, []);

    const toggleSelectMode = useCallback(() => {
        setSelectMode((prev) => !prev);
    }, []);

    const toggleAspectRatio = useCallback(() => {
        setMaintainAspectRatio((prev) => !prev);
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(photos.map(p => getPhotoKey(p))));
    }, [photos]);

    const openInDevice = useCallback(async (photo: PhotoView, fingerprint: string | null) => {
        try {
            const serviceController = await getServiceController(fingerprint);
            await serviceController.files.openFile(photo.deviceFingerprint, photo.fileId);
        } catch (e: any) {
            console.error(e);
        }
    }, []);

    const sendToDevice = useCallback(async (file: PhotoView, fingerprint: string) => {
        try {
            const serviceController = await getServiceController(fingerprint);
            await serviceController.files.download(window.modules.config.FINGERPRINT, file.fileId);
        } catch (e: any) {
            console.error(e);
        }
    }, []);

    const copy = useCallback(async () => {
        const selectedIds = getCurrentSelectedItems().map(item => item.fileId);
        await setItemsToCopy(fetchOptions.deviceFingerprint, selectedIds, false);
    }, [getCurrentSelectedItems, fetchOptions.deviceFingerprint]);

    const download = useCallback(async (item: PhotoView) => {
        const localSc = window.modules.getLocalServiceController();
        await localSc.files.download(fetchOptions.deviceFingerprint, item.fileId);
    }, [fetchOptions.deviceFingerprint]);

    const share = useCallback(async () => {
        const selectedItems = getCurrentSelectedItems();
        const fileIds = selectedItems.map(item => item.fileId);
        if (fileIds.length === 0) return;
        const localSc = window.modules.getLocalServiceController();
        localSc.files.shareFiles(fetchOptions.deviceFingerprint, fileIds);
    }, [getCurrentSelectedItems, fetchOptions.deviceFingerprint]);

    const handleContextMenuClick = useCallback((id: string) => {
        const clickedItem = rightClickedItemRef.current;

        if (id.startsWith('openInDevice=')) {
            const fingerprint = id.split('=')[1];
            if (clickedItem) openInDevice(clickedItem, fingerprint);
        }

        if (id.startsWith('sendToDevice=')) {
            const fingerprint = id.split('=')[1];
            if (clickedItem) sendToDevice(clickedItem, fingerprint);
        }

        switch (id) {
            case 'selectAll':
                selectAll();
                break;
            case 'preview':
                if (clickedItem) previewPhoto(clickedItem);
                break;
            case 'openNative':
                if (clickedItem) openInDevice(clickedItem, null);
                break;
            case 'delete':
                openDeleteDialog();
                break;
            case 'copy':
                copy();
                break;
            case 'download':
                if (clickedItem) download(clickedItem);
                break;
            case 'share':
                share();
                break;
        }
        rightClickedItemRef.current = null;
    }, [openInDevice, sendToDevice, selectAll, previewPhoto, openDeleteDialog, copy, download, share]);

    const onRightClick = useCallback((item: PhotoView, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        // Store the right-clicked item in ref for use in menu handlers
        rightClickedItemRef.current = item;

        selectPhoto(item, false, true);

        // Build menu items directly to avoid state delay
        const isAlreadySelected = selectedIds.has(getPhotoKey(item));
        const currentSelectedCount = isAlreadySelected ? selectedCount : selectedCount + 1;

        const items: ContextMenuItem[] = [];
        if (currentSelectedCount === 1) {
            items.push({ id: 'preview', label: 'Preview' });
            items.push({ id: 'openNative', label: 'Open as File' });
            items.push({
                id: 'openInDevice',
                label: 'Open in Device',
                subItems: peers.map(p => {
                    return {
                        id: `openInDevice=${p.fingerprint}`,
                        label: p.deviceName,
                    }
                })
            });
            items.push({
                id: 'sendToDevice',
                label: 'Send to Device',
                subItems: peers.map(p => {
                    return {
                        id: `sendToDevice=${p.fingerprint}`,
                        label: p.deviceName,
                    }
                })
            });
            items.push({ id: 'download', label: 'Download' });
        }
        items.push({ id: 'copy', label: 'Copy' });
        isMacos() && items.push({ id: 'share', label: 'Export' });
        items.push({
            id: 'delete',
            label: currentSelectedCount === 1 ? 'Delete photo' : `Delete (${currentSelectedCount}) photos`,
        });

        window.utils.openContextMenu(items, handleContextMenuClick);
    }, [selectPhoto, selectedIds, selectedCount, handleContextMenuClick, peers]);

    const getContainerContextMenuItems = useCallback((): ContextMenuItem[] | undefined => {
        const items: ContextMenuItem[] = [];
        items.push({ id: 'paste', label: 'Paste', disabled: true });
        items.push({ id: 'selectAll', label: 'Select all' });
        return items;
    }, []);

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
                    <MenuButton title='Maintain aspect ratio' onClick={toggleAspectRatio} selected={maintainAspectRatio}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
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
                <ContextMenuArea
                    onMenuOpen={getContainerContextMenuItems}
                    onMenuItemClick={handleContextMenuClick}
                    style={{ width: '100%', 'height': '100%' }}
                >
                    <div
                        ref={contentContainerRef}
                        onClick={onClickOutside}
                        onContextMenu={onRightClickOutside}
                        className={cn(isMacosTheme() ? 'px-1' : 'px-7')}
                    >
                        <PhotoGrid
                            dateKey={fetchOptions.sortBy}
                            photos={photos}
                            selectedIds={selectedIds}
                            size={zoom}
                            containerHeight={containerHeight}
                            onClick={onClick}
                            onDoubleClick={onDoubleClick}
                            onRightClick={onRightClick}
                            hasMore={hasMore}
                            isLoading={isLoading}
                            onLoadMore={fetchNew}
                            maintainAspectRatio={maintainAspectRatio}
                        />
                        {
                            !error && !hasMore && !photos.length && <div className='p-5 py-10 min-h-[50vh] flex flex-col justify-center items-center'>
                                <Image src='/img/purr-remote-work.png' alt='No Photos' className='w-[14rem] h-auto max-w-[80vw]' priority width={0} height={0} />
                                <div className='text-lg font-semibold'>Nothing to see here, except for the cat.</div>
                            </div>
                        }
                        {error && <div className='p-5 py-10 flex justify-center items-center text-red-500'>
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            <span className='ml-2 text-sm'>{error}</span>
                        </div>}
                    </div>
                </ContextMenuArea>
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
