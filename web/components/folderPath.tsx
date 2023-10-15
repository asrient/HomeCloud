import { RemoteItem, Storage } from "@/lib/types";
import { storageToRemoteItem } from "@/lib/fileUtils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getStat } from "@/lib/api/fs";
import { useRouter } from "next/router";
import { folderViewUrl } from "@/lib/urls";
import Link from "next/link";

function PathElement({ item, clickable, storageId }: { item: RemoteItem, clickable?: boolean, storageId: number }) {
    const link = useMemo(() => {
        return folderViewUrl(storageId, item.id);
    }, [item.id, storageId]);

    const content = (<span className={`${clickable ? 'text-blue-400 cursor-pointer' : 'text-gray-500 cursor-default'}`}>
        {item.name}
    </span>);

    if (clickable) {
        return (<Link href={link}>{content}</Link>)
    }
    return (content)
}

export default function FolderPath({ folder, storage }: { folder: RemoteItem, storage: Storage }) {
    const [chain, setChain] = useState<RemoteItem[]>([folder]);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    useEffect(() => {
        setChain([folder]);
    }, [folder]);

    const fetchParents = useCallback(async () => {
        if (!chain[0].parentIds || !chain[0].parentIds.length || isLoading) return;
        setIsLoading(true);
        let parentId: string | undefined = chain[0].parentIds[0];
        let counter = 0;
        const parents: RemoteItem[] = [];
        while (parentId && counter < 3) {
            try {
                const parent = await getStat({
                    storageId: storage.id,
                    id: parentId,
                });
                parentId = parent.parentIds?.[0];
                if (!parentId) {
                    parents.push(storageToRemoteItem(storage));
                } else {
                    parents.push(parent);
                }
                counter++;
            } catch (e) {
                break;
            }
        }
        parents.reverse();
        setChain([...parents, ...chain]);
        setIsLoading(false);
    }, [chain, storage, isLoading]);

    const rootFolder = useMemo(() => {
        return !!chain[0].parentIds && chain[0].parentIds.length ? storageToRemoteItem(storage) : null;
    }, [storage, chain]);

    return (<div className="text-[0.7rem]">
        {
            rootFolder && (
                <>
                    <PathElement item={rootFolder} clickable storageId={storage.id} />
                    <span onClick={fetchParents} className='text-gray-500 px-1 mx-1 rounded-sm bg-muted cursor-pointer' title='Expand'>
                        .../
                    </span>
                </>
            )
        }
        {
            chain.map((item, index) => {
                if (index === chain.length - 1) {
                    return (<PathElement key={item.id} item={item} storageId={storage.id} />)
                }
                return (<span key={item.id}>
                    <PathElement item={item} clickable storageId={storage.id} />
                    <span className='mx-1 text-gray-500'>/</span>
                </span>)
            })
        }
    </div>)
}
