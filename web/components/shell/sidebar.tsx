import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/router";
import Link from "next/link";
import { NextUrl, SidebarItem, SidebarList } from "@/lib/types";
import { useCallback } from "react";
import Image from "next/image";


function SidebarItemView({ item, isMatch, onRightClick, onClick }: {
    item: SidebarItem,
    isMatch: boolean,
    onRightClick?: (item: SidebarItem) => void,
    onClick?: (item: SidebarItem, e: React.MouseEvent) => void,
}) {

    const onRightClick_ = useCallback((e: React.MouseEvent) => {
        if (onRightClick && item.rightClickable) {
            onRightClick(item);
        } else {
            e.stopPropagation();
            e.preventDefault();
        }
    }, [item, onRightClick]);

    const onClick_ = useCallback((e: React.MouseEvent) => {
        if (onClick ) {
            onClick(item, e);
        }
    }, [item, onClick]);

    return (<Link href={item.href || ''} onContextMenu={onRightClick_} onClick={onClick_}>
        <Button variant={isMatch ? 'secondary' : 'ghost'} className="sidebarItem w-full justify-start">
            {item.icon && <Image
                alt={item.title}
                src={item.icon}
                loading="eager"
                height={0}
                width={0}
                className="mr-2 h-5 w-5"
            />}
            {item.title}
        </Button>
    </Link>)
}

export function Sidebar({ className, list, onRightClick, onClick }: {
    className?: string,
    list?: SidebarList,
    onRightClick?: (item: SidebarItem) => void,
    onClick?: (item: SidebarItem, e: React.MouseEvent) => void,
}) {
    const router = useRouter();
    const { pathname, query } = router;

    const isMatch = useCallback((nextUrl: NextUrl) => {
        if (pathname != nextUrl.pathname) return false;
        if (!nextUrl.query) return true;
        const keys = Object.keys(nextUrl.query);
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (nextUrl.query[key] != query[key]) return false;
        }
        return true;
    }, [pathname, query]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        const isSidebarItem = e.target instanceof HTMLElement && e.target.closest('.sidebarItem');
        if (!isSidebarItem) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, []);

    return (
        <div className={cn("pb-12", className)} onContextMenu={handleContextMenu}>
            <div className="space-y-4 pb-2">
                {
                    list?.map((item, index) => (
                        <div className="px-3 py-2" key={index}>
                            {
                                item.title && (<h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                                    {item.title}
                                </h2>)
                            }

                            <div className="space-y-1">
                                {
                                    item.items?.map((item: SidebarItem) => (
                                        <SidebarItemView
                                            key={item.key}
                                            item={item}
                                            isMatch={!!item.href && isMatch(item.href)}
                                            onRightClick={onRightClick}
                                            onClick={onClick} />
                                    ))
                                }
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    )
}
