import { RemoteItem } from "@/lib/types";
import { folderViewUrl } from "@/lib/urls";
import { getKind, getDefaultIcon } from "@/lib/fileUtils";
import { useRouter } from "next/router";
import LazyImage from "./lazyImage";
import { cn, isMobile } from "@/lib/utils";
import Image from "next/image";

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

function ThumbnailImage({ item, className }: { item: RemoteItem, className?: string }) {

    const fetchThumbnailSrc = async () => {
        if (item.type === 'directory' || !item.thumbnail) return null;
        return item.thumbnail;
    }

    return (<LazyImage
        fetchSrc={fetchThumbnailSrc}
        src={getDefaultIcon(item)}
        alt={item.name}
        width="0"
        height="0"
        className={cn("h-[4rem] w-full object-contain", className)}
    />)
}

function GridItem({ item, storageId, onDbClick }: { item: RemoteItem, storageId: number, onDbClick: (item: RemoteItem) => void }) {

    const onDbClick_ = () => {
        onDbClick(item);
    }

    const onClick = () => {
        if (isMobile()) {
            onDbClick(item);
        }
    }

    return (<div onDoubleClick={onDbClick_} onClick={onClick} className="flex flex-col cursor-default justify-center items-center text-center rounded-md hover:bg-muted p-2 min-w-[8rem]">
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

function GridGroup({ items, title, storageId, onDbClick }: {
    items: RemoteItem[];
    title?: string;
    sortBy: SortBy;
    storageId: number;
    onDbClick: (item: RemoteItem) => void;
}) {
    return (<div className="p-1 py-2 md:p-2 md:py-3 lg:p-4">
        {title && <h2 className="text-lg font-bold">{title}</h2>}
        <div className="grid gap-3 grid-cols-3 md:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:cols-8">
            {items.map(item => <div key={item.id} className="h-full w-full flex justify-center items-center">
                <GridItem onDbClick={onDbClick} storageId={storageId} item={item} />
            </div>)}
        </div>
    </div>)
}

function ListItem({ item }: { item: RemoteItem }) {
    return (<div className="flex items-center px-4 py-2 space-x-3 shadow-sm">
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

function ListGroup({ items, title }: {
    items: RemoteItem[];
    title?: string;
}) {
    return (<div>
        {title && <h2 className="text-lg font-bold">{title}</h2>}
        <div className="space-y-3">
            {items.map(item => <ListItem key={item.id} item={item} />)}
        </div>
    </div>)
}

export default function FilesView({ items, view, groupBy, sortBy, storageId }: {
    items: RemoteItem[];
    view: 'list' | 'grid';
    groupBy: GroupBy;
    sortBy: SortBy
    storageId: number;
}) {

    const router = useRouter();

    const onDbClick = (item: RemoteItem) => {
        if (item.type === 'directory') {
            router.push(folderViewUrl(storageId, item.id))
        }
    }

    if(items.length === 0) return (<div className="min-h-[80vh] p-5 flex flex-col justify-center items-center text-center text-gray-500">
        <div className="pb-3">
            <Image src="/img/papers.png" alt="Empty" width={100} height={100} />
        </div>
        <div className="text-lg text-primary">No files</div>
        <div className="text-sm">Upload some files to see them here.</div>
    </div>)

    return (<div>
        {view === 'grid' && <GridGroup onDbClick={onDbClick} storageId={storageId} items={items} sortBy={sortBy} />}
        {view === 'list' && <ListGroup items={items} />}
    </div>)
}