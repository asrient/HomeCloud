import { RemoteItem, RemoteItemWithStorage } from "@/lib/types";
import { folderViewUrl } from "@/lib/urls";
import { getKind, getDefaultIcon, canGenerateThumbnail } from "@/lib/fileUtils";
import { useRouter } from "next/router";
import LazyImage from "./lazyImage";
import { cn, isMobile } from "@/lib/utils";
import Image from "next/image";
import { getThumbnail } from "@/lib/api/files";
import { useCallback, useMemo } from "react";

export enum SortBy {
    Name = 'Name',
    AddedOn = 'AddedOn',
    ModifiedOn = 'ModifiedOn',
    Type = 'Type',
    None = 'None',
}

export enum GroupBy {
    None = 'None',
    AddedOn = 'AddedOn',
    Type = 'Type',
    ModifiedOn = 'ModifiedOn',
}

export type FileRemoteItem = RemoteItem & {
    storageId: number | null;
    isSelected: boolean;
}

function ThumbnailImage({ item, className }: { item: FileRemoteItem, className?: string }) {
    const dafaultSrc = useMemo(() => getDefaultIcon(item), [item]);

    const fetchThumbnailSrc = useCallback(async () => {
        if (item.type === 'directory') return null;
        if (!item.thumbnail && canGenerateThumbnail(item) && 'storageId' in item && item.storageId) {
            const thumbResp = await getThumbnail(item.storageId, item.id);
            item.thumbnail = thumbResp.image;
        }
        return item.thumbnail;
    }, [item]);

    return (<LazyImage
        fetchSrc={fetchThumbnailSrc}
        src={dafaultSrc}
        alt={item.name}
        width="0"
        height="0"
        className={cn("h-[4rem] w-full object-contain", className)}
    />)
}

export type ItemParams = {
    item: FileRemoteItem;
    onDbClick?: (item: FileRemoteItem) => void;
    onClick?: (item: FileRemoteItem) => void;
    onRightClick?: (item: FileRemoteItem) => void;
}

function GridItem({ item, onDbClick, onClick, onRightClick }: ItemParams) {

    const onDbClick_ = useCallback((e: React.MouseEvent) => {
        onDbClick && onDbClick(item);
        e.stopPropagation();
    }, [onDbClick, item]);

    const onClick_ = useCallback((e: React.MouseEvent) => {
        onClick && onClick(item);
        e.stopPropagation();
    }, [onClick, item]);

    const onRightClick_ = useCallback((e: React.MouseEvent) => {
        onRightClick && onRightClick(item);
    }, [onRightClick, item]);

    return (<div onDoubleClick={onDbClick_}
        onClick={onClick_}
        onContextMenu={onRightClick_}
        className={`flex flex-col cursor-default justify-center items-center text-center rounded-md p-2 min-w-[8rem] ${item.isSelected ? 'bg-blue-100' : 'hover:bg-muted'}`}>
        <div className="pb-1">
            <ThumbnailImage item={item} />
        </div>
        <div title={item.name} className="mt-2 text-xs font-medium overflow-ellipsis overflow-hidden max-w-[8rem]">
            {item.name}
        </div>
        <div className="mt-1 text-xs text-gray-500">
            <span>{getKind(item)}</span>
        </div>
    </div>)
}

function ListItem({ item, onDbClick, onClick, onRightClick }: ItemParams) {
    const onDbClick_ = (e: React.MouseEvent) => {
        onDbClick && onDbClick(item);
        e.stopPropagation();
    }

    const onClick_ = (e: React.MouseEvent) => {
        onClick && onClick(item);
        e.stopPropagation();
    }

    const onRightClick_ = (e: React.MouseEvent) => {
        onRightClick && onRightClick(item);
    }
    return (<div className={`flex items-center px-4 py-2 space-x-3 shadow-sm ${item.isSelected ? 'bg-blue-100' : 'hover:bg-muted'}`}
        onDoubleClick={onDbClick_}
        onClick={onClick_}
        onContextMenu={onRightClick_}>
        <div className="flex-shrink-0">
            <ThumbnailImage className="h-[2.5rem] w-[3rem]" item={item} />
        </div>
        <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
            <div className="text-sm text-gray-500">
                <span>{item.type}</span>
            </div>
        </div>
    </div>)
}

export type GroupParams = Omit<ItemParams & {
    items: FileRemoteItem[];
    title?: string;
    sortBy: SortBy;
    view?: 'list' | 'grid';
}, 'item'>;

export function Group({ items, title, view, ...rest }: GroupParams) {
    return (<div className={`${view === 'grid' ? "p-4" : ''}`}>
        {title && <h2 className="text-sm border-b p-2 pb-1 mb-4">{title}</h2>}
        {
            view === 'grid' ? (<div className="grid gap-3 grid-cols-3 md:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:cols-8">
                {items.map(item => <div key={item.storageId + item.id} className="h-full w-full flex justify-center items-center">
                    <GridItem {...rest} item={item} />
                </div>)}
            </div>)
                : (<div>
                    {items.map(item => <ListItem key={item.storageId + item.id} {...rest} item={item} />)}
                </div>)
        }

    </div>)
}

export type FilesViewParams = GroupParams & {
    groupBy: GroupBy;
}

export default function FilesView({ items, onDbClick, onClick, groupBy, ...rest }: FilesViewParams) {

    const router = useRouter();

    const onDbClick_ = useCallback((item: RemoteItem) => {
        if (item.type === 'directory' && 'storageId' in item) {
            router.push(folderViewUrl(item.storageId as number, item.id))
        }
    }, [router]);

    const onClick_ = useCallback((item: RemoteItem) => {
        if (isMobile()) {
            onDbClick_(item);
        }
    }, [onDbClick_]);

    if (items.length === 0) return (<div className="min-h-[80vh] p-5 flex flex-col justify-center items-center text-center text-gray-500">
        <div className="pb-3">
            <Image src="/img/papers.png" alt="Empty" width={100} height={100} />
        </div>
        <div className="text-lg text-primary">No files</div>
        <div className="text-sm">Upload some files to see them here.</div>
    </div>)

    return (<div className='pb-5'>
        <Group items={items} onDbClick={onDbClick || onDbClick_} onClick={onClick || onClick_} {...rest} />
    </div>)
}
