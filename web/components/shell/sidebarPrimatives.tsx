import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import Link from "next/link";
import { SidebarItem, SidebarList, SidebarSection } from "@/lib/types";
import { useCallback } from "react";
import { useUrlMatch } from "../hooks/useUrlMatch";
import { ThemedIcon } from "../themedIcons";


function SidebarItemView({ item, isMatch, onRightClick, onClick, isParent }: {
    item: SidebarItem,
    isMatch: boolean,
    isParent?: boolean,
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
        if (onClick) {
            onClick(item, e);
        }
    }, [item, onClick]);

    return (<Link href={item.href || ''} onContextMenu={onRightClick_} onClick={onClick_}>
        <Button variant={isMatch ? 'secondary' : 'ghost'}
            className={cn(
                isMatch && "bg-foreground/10",
                isMatch && isWin11Theme() ? 'win11-selected': 'border-none',
                !isMacosTheme() && !isParent && 'pl-7',
                "rounded-md sidebarItem w-full justify-start text-left text-ellipsis truncate h-8")}
        >
            {item.icon && <ThemedIcon name={item.icon} size={20} className={cn("mr-2", isMacosTheme() && 'text-primary/80')} type={isMacosTheme() ? "symbol" : "image"} />}
            {item.title}
        </Button>
    </Link>)
}

export function SidebarSectionView({ section, onRightClick, onClick }: {
    section: SidebarSection,
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
        <div className={cn("pl-2 py-2",
            isMacosTheme() ? 'font-semibold text-sm text-foreground/80' : 'font-normal text-sm text-foreground',
        )}>
            {
                section.title && (<div className={cn(
                    "mb-1 px-4",
                    isMacosTheme() && 'tracking-tight text-muted-foreground/90',
                    )}>
                    {section.title}
                </div>)
            }

            <div className={cn("space-y-1")} onContextMenu={handleContextMenu}>
                {
                    section.items?.map((item: SidebarItem) => (
                        <div key={item.key}>
                            <SidebarItemView
                            item={item}
                            isMatch={!!item.href && isMatch(item.href)}
                            onRightClick={onRightClick}
                            isParent={section.title === undefined}
                            onClick={onClick} />
                        </div>
                    ))
                }
            </div>
        </div>
    )
}

export function SidebarView({ className, children }: {
    className?: string,
    children?: React.ReactNode,
}) {
    return (
        <div className={cn("pb-12 space-y-4", className)}>
            {children}
        </div>
    )
}

export function Sidebar({ className, list, onRightClick, onClick }: {
    className?: string,
    list: SidebarList,
    onRightClick?: (item: SidebarItem) => void,
    onClick?: (item: SidebarItem, e: React.MouseEvent) => void,
}) {

    return (
        <SidebarView className={className}>
            {
                list.map((section: SidebarSection, index: number) => (
                    <SidebarSectionView
                        key={index}
                        section={section}
                        onRightClick={onRightClick}
                        onClick={onClick} />
                ))}
        </SidebarView>
    )
}
