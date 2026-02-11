import { RemoteItem, PeerInfo } from "shared/types";
import { getPathChain } from "@/lib/fileUtils";
import { useMemo } from "react";
import { folderViewUrl } from "@/lib/urls";
import Link from "next/link";

function PathElement({ item, clickable, deviceFingerprint }: { item: RemoteItem, clickable?: boolean, deviceFingerprint: string | null }) {
    const link = useMemo(() => {
        return folderViewUrl(deviceFingerprint, item.path);
    }, [item.path, deviceFingerprint]);

    const content = (<span className={`${clickable ? 'text-blue-400 cursor-pointer' : 'text-gray-500 cursor-default'}`}>
        {item.name}
    </span>);

    if (clickable) {
        return (<Link href={link}>{content}</Link>)
    }
    return (content)
}

export default function FolderPath({ folder, peer }: { folder: RemoteItem, peer: PeerInfo | null }) {

    const chain = useMemo(() => {
        return getPathChain(folder.path);
    }, [folder]);

    const fingerprint = useMemo(() => {
        return peer ? peer.fingerprint : null;
    }, [peer]);

    return (<div className="text-[0.7rem]">
        {
            chain.map((item, index) => {
                if (index === chain.length - 1) {
                    return (<PathElement key={item.path} item={item} deviceFingerprint={fingerprint} />)
                }
                return (<span key={item.path}>
                    <PathElement item={item} clickable deviceFingerprint={fingerprint} />
                    <span className='mx-1 text-gray-500'>/</span>
                </span>)
            })
        }
    </div>)
}
