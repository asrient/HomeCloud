import { folderViewUrl } from "@/lib/urls";
import { getKind, getDefaultIcon, canGenerateThumbnail } from "@/lib/fileUtils";
import { useRouter } from "next/router";
import LazyImage from "./lazyImage";
import { cn, getServiceController, isMobile } from "@/lib/utils";
import Image from "next/image";
import { useCallback, useMemo } from "react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { RemoteItemWithPeer } from "@/lib/types";

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

export type FileRemoteItem = RemoteItemWithPeer & {
    isSelected: boolean;
    assetUrl?: string;
}

function ThumbnailImage({ item, className }: { item: FileRemoteItem, className?: string }) {
    const dafaultSrc = useMemo(() => getDefaultIcon(item), [item]);

    const fetchThumbnailSrc = useCallback(async () => {
        if (item.type === 'directory') return null;
        const serviceController = await getServiceController(item.deviceFingerprint);
        if (!canGenerateThumbnail(item)) return null;
        return serviceController.thumbnail.generateThumbnailURI(item.path);
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
    onDbClick?: (item: FileRemoteItem, e: React.MouseEvent) => void;
    onClick?: (item: FileRemoteItem, e: React.MouseEvent) => void;
    onRightClick?: (item: FileRemoteItem, e: React.MouseEvent) => void;
}

function GridItem({ item, onDbClick, onClick, onRightClick }: ItemParams) {

    const onDbClick_ = useCallback((e: React.MouseEvent) => {
        onDbClick && onDbClick(item, e);
    }, [onDbClick, item]);

    const onClick_ = useCallback((e: React.MouseEvent) => {
        onClick && onClick(item, e);
    }, [onClick, item]);

    const onRightClick_ = useCallback((e: React.MouseEvent) => {
        onRightClick && onRightClick(item, e);
    }, [onRightClick, item]);

    return (<div onDoubleClick={onDbClick_}
        onClick={onClick_}
        onContextMenu={onRightClick_}
        className={`fileItem select-none flex flex-col cursor-default justify-center items-center text-center rounded-md p-2 min-w-[8rem] ${item.isSelected ? 'bg-blue-100' : 'hover:bg-muted'}`}>
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
        onDbClick && onDbClick(item, e);
    }

    const onClick_ = (e: React.MouseEvent) => {
        onClick && onClick(item, e);
    }

    const onRightClick_ = (e: React.MouseEvent) => {
        onRightClick && onRightClick(item, e);
    }

    return (<div className={`fileItem select-none flex items-center px-4 py-2 space-x-3 shadow-sm ${item.isSelected ? 'bg-blue-100' : 'hover:bg-muted'}`}
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

export function Group({ items, title, view, onDbClick, onClick, ...rest }: GroupParams) {
    const router = useRouter();

    const onDbClick_ = useCallback((item: FileRemoteItem, e: React.MouseEvent) => {
        if (item.type === 'directory' && 'deviceFingerprint' in item) {
            e.stopPropagation();
            router.push(folderViewUrl(item.deviceFingerprint, item.path))
        }
    }, [router]);

    const onClick_ = useCallback((item: FileRemoteItem, e: React.MouseEvent) => {
        if (isMobile()) {
            onDbClick_(item, e);
        }
    }, [onDbClick_]);

    const main = view === 'grid'
        ? (<div className="grid gap-3 grid-cols-3 md:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:cols-8">
            {items.map(item => <div key={item.deviceFingerprint + item.path} className="h-full w-full flex justify-center items-center">
                <GridItem
                    onDbClick={onDbClick || onDbClick_}
                    onClick={onClick || onClick_}
                    {...rest}
                    item={item} />
            </div>)}
        </div>)
        : (<div>
            {items.map(item => <ListItem
                onDbClick={onDbClick || onDbClick_}
                onClick={onClick || onClick_}
                key={item.deviceFingerprint + item.path}
                {...rest}
                item={item} />)}
        </div>)

    return (<div className={cn(view === 'grid' && "px-2 sm:px-4", view === 'grid' && !title && 'py-4')}>
        {
            !!title
                ? (<Accordion type="single" defaultValue="item-1" collapsible>
                    <AccordionItem value="item-1">
                        <AccordionTrigger>{title}</AccordionTrigger>
                        <AccordionContent>
                            {main}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>)
                : (main)
        }
    </div>)
}

export type FilesViewParams = GroupParams & {
    groupBy: GroupBy;
}

export default function FilesView({ items, groupBy, ...rest }: FilesViewParams) {

    if (items.length === 0) return (<div className="min-h-[80vh] p-5 flex flex-col justify-center items-center text-center text-gray-500">
        <div className="pb-3">
            <Image src="/img/purr-page-not-found.png" priority alt="Empty" width={200} height={200} />
        </div>
        <div className="text-lg text-primary">It's Empty</div>
        <div className="text-sm">Upload some files to see them here.</div>
    </div>)

    return (<div className='pb-5'>
        <Group items={items} {...rest} />
    </div>)
}
