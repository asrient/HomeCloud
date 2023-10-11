import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/router";
import Link from "next/link";
import { useFilesBar } from "../hooks/useSidebar";
import { NextUrl, SidebarItem, SidebarList } from "@/lib/types";
import { useCallback } from "react";
import Image from "next/image";

export function Sidebar({ className, list }: { className?: string, list?: SidebarList }) {
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

    return (
        <div className={cn("pb-12", className)}>
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
                                    item.items?.map((item: SidebarItem, index: number) => (
                                        <Link href={item.href} key={index}>
                                            <Button variant={isMatch(item.href) ? 'secondary' : 'ghost'} className="w-full justify-start">
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
                                        </Link>
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

export function FilesSidebar() {
    const list = useFilesBar();
    return <Sidebar list={list} />
}
