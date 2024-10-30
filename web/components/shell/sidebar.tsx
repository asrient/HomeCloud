import { cn, isMobile } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link";
import { SidebarItem, SidebarList } from "@/lib/types";
import { useCallback } from "react";
import Image from "next/image";
import { useUrlMatch } from "../hooks/useUrlMatch";
import useHideSidebar from "../hooks/useHideSidebar";


function SidebarItemView({ item, isMatch, onRightClick, onClick }: {
    item: SidebarItem,
    isMatch: boolean,
    onRightClick?: (item: SidebarItem) => void,
    onClick?: (item: SidebarItem, e: React.MouseEvent) => void,
}) {
    const hideSidebar = useHideSidebar();
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
        } else {
            if (isMobile()) {
                hideSidebar();
            }
        }
    }, [hideSidebar, item, onClick]);

    return (<Link href={item.href || ''} onContextMenu={onRightClick_} onClick={onClick_}>
        <Button variant={isMatch ? 'secondary' : 'ghost'} 
        className={cn(
            isMatch && "bg-foreground/10",
            "rounded-md sidebarItem w-full justify-start text-xs text-left text-ellipsis text-foreground/80 truncate font-medium h-8")}
        >
            {item.icon && <Image
                alt={item.title}
                src={item.icon}
                loading="eager"
                height={23}
                width={23}
                className="mr-2"
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
    const isMatch = useUrlMatch();

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
                        <div className="px-2 md:pr-0 py-2" key={index}>
                            {
                                item.title && (<h2 className="mb-1 px-4 text-xs font-semibold tracking-tight text-muted-foreground/90">
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
