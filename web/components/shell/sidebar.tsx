import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/router";
import Link from "next/link";
import { useFilesBar } from "../hooks/useSidebar";
import { SidebarItem, SidebarList } from "@/lib/types";

export function Sidebar({ className, list }: { className?: string, list?: SidebarList }) {
    const router = useRouter();
    const pathname = router.pathname;

    return (
        <div className={cn("pb-12", className)}>
            <div className="space-y-4 py-4">
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
                                            <Button variant={pathname === item.href ? 'secondary' : 'ghost'} className="w-full justify-start">
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    className="mr-2 h-4 w-4"
                                                >
                                                    <circle cx="12" cy="12" r="10" />
                                                    <polygon points="10 8 16 12 10 16 10 8" />
                                                </svg>
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
