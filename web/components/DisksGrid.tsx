import Link from "next/link";
import { useDisks } from "./hooks/useSystemState";
import LoadingIcon from "./ui/loadingIcon";
import Image from "next/image";
import { folderViewUrl } from "@/lib/urls";
import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils";

export function DisksGrid({ deviceFingerprint }: { deviceFingerprint: string | null }) {
    const { disks, isLoading } = useDisks(deviceFingerprint);
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {isLoading ? (
                <div className="col-span-full flex justify-center items-center">
                    <LoadingIcon className="w-5 h-5" />
                </div>
            ) : (
                disks.map((disk) => (
                    <Link key={disk.path}
                        href={folderViewUrl(deviceFingerprint, disk.path)}
                        title={`${((disk.size - disk.free) / disk.size * 100).toFixed(2)}% used`}
                        className={cn(
                            "p-4 overflow-hidden flex items-start gap-4 hover:bg-secondary/50 transition-colors",
                            isMacosTheme() ? "rounded-lg" : "rounded-sm"
                        )}
                    >
                        <div className="flex justify-center items-center h-full">
                            <Image src="/icons/ssd.png" alt="Disk Icon" width={50} height={50} />
                        </div>
                        <div className="flex-grow">
                            <h3 className="text-sm font-semibold mb-0.5">{disk.name}</h3>
                            <p className="text-sm text-foreground/80 mb-0.5">{(disk.size / (1024 ** 3)).toFixed(2)} GB</p>
                            {/* Progress bar showing used space */}
                            <div className={cn("w-full bg-muted overflow-hidden max-w-[12rem]", isWin11Theme() ? "rounded-none h-2.5" : "rounded-full h-2")}>
                                <div
                                    className={cn("bg-muted-foreground transition-all duration-500", isWin11Theme() ? "h-2.5 rounded-none" : "h-2 rounded-full")}
                                    style={{ width: `${((disk.size - disk.free) / disk.size) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </Link>
                ))
            )}
        </div>
    );
}
