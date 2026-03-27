import { usePeerState } from "./hooks/usePeerState";
import { useAppState } from "./hooks/useAppState";
import { useNavigation } from "./hooks/useNavigation";
import { cn, isMacosTheme, isWin11Theme } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Laptop, Smartphone, Tablet, Server, MoreHorizontal, Plus, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PeerState } from "@/lib/types";
import { DeviceFormType } from "@/lib/enums";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { useAccountState } from "@/components/hooks/useAccountState";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const CHAR_WIDTH = 7; // approximate character width in px at text-xs
const BUTTON_PADDING_MACOS = 40; // px-4 (12px * 2) + gap + icon (16px)
const BUTTON_PADDING_DEFAULT = 28; // px-2 (8px * 2) + gap + icon (16px)
const MORE_BUTTON_WIDTH = 90;
const CONTAINER_PADDING = 32; // px-4 = 16px * 2
const GAP = 6; // gap-1.5

function estimateButtonWidth(label: string): number {
    return (isMacosTheme() ? BUTTON_PADDING_MACOS : BUTTON_PADDING_DEFAULT) + label.length * CHAR_WIDTH;
}

function getDeviceIcon(formFactor?: DeviceFormType): LucideIcon {
    switch (formFactor) {
        case DeviceFormType.Mobile: return Smartphone;
        case DeviceFormType.Tablet: return Tablet;
        case DeviceFormType.Laptop: return Monitor;
        case DeviceFormType.Server: return Server;
        case DeviceFormType.Desktop: return Monitor;
        default: return Monitor;
    }
}

function PillButton({ icon: Icon, label, isSelected, onClick }: {
    icon: LucideIcon;
    label: string;
    isSelected?: boolean;
    onClick: () => void;
}) {
    return (
        <Button
            variant={isMacosTheme() ? "secondary" : "link"}
            useGlass={isSelected}
            size="sm"
            onClick={onClick}
            stretch={isMacosTheme()}
            className={cn("gap-1.5 whitespace-nowrap py-0.5",
            isMacosTheme() ? 'max-w-full px-4' : 'px-2',
            !isSelected && 'text-foreground/60 hover:text-foreground',
            !isMacosTheme() && isSelected && 'border-b-[0.5px] border-foreground rounded-none',
            isSelected && !isMacosTheme() && 'text-foreground',
            !isSelected && isMacosTheme() && 'bg-transparent'
            )}>
            <Icon size={16} />
            <span className="truncate">{label}</span>
        </Button>
    );
}

export function PeerQuickSelect() {
    const peers = usePeerState();
    const { selectedFingerprint } = useAppState();
    const { openDevicePage } = useNavigation();
    const { isLinked } = useAccountState();
    const { openDialog } = useOnboardingStore();

    const onSelect = useCallback((fingerprint: string | null) => {
        openDevicePage(fingerprint);
    }, [openDevicePage]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) {
                setContainerWidth(entry.contentBoxSize[0].inlineSize);
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const { visiblePeers, overflowPeers } = useMemo(() => {
        if (peers.length === 0) return { visiblePeers: [], overflowPeers: [] };

        const availableWidth = containerWidth - CONTAINER_PADDING;
        const thisDeviceWidth = estimateButtonWidth('This Device');
        let remaining = availableWidth - thisDeviceWidth - GAP;

        // Check if all peers fit
        const totalPeersWidth = peers.reduce((sum, p) => sum + estimateButtonWidth(p.deviceName || 'Unknown') + GAP, 0);
        const needsMore = totalPeersWidth > remaining;
        if (needsMore) {
            remaining -= MORE_BUTTON_WIDTH + GAP;
        }

        let visibleCount = 0;
        let usedWidth = 0;
        for (const peer of peers) {
            const btnWidth = estimateButtonWidth(peer.deviceName || 'Unknown') + GAP;
            if (usedWidth + btnWidth > remaining) break;
            usedWidth += btnWidth;
            visibleCount++;
        }
        visibleCount = Math.max(1, visibleCount);

        if (visibleCount >= peers.length) {
            return { visiblePeers: peers, overflowPeers: [] };
        }
        return {
            visiblePeers: peers.slice(0, visibleCount),
            overflowPeers: peers.slice(visibleCount),
        };
    }, [peers, containerWidth]);

    return (
        <div ref={containerRef} className={cn("flex flex-row items-center mx-4 my-3",
            isMacosTheme () ?'gap-1 justify-between' : 'gap-4',
            isMacosTheme() && 'bg-secondary/50 rounded-full'
        )}>
            <PillButton
                icon={Monitor}
                label="This Device"
                isSelected={selectedFingerprint === null}
                onClick={() => onSelect(null)}
            />

            {visiblePeers.map(peer => (
                <PillButton
                    key={peer.fingerprint}
                    icon={getDeviceIcon(peer.deviceInfo?.formFactor)}
                    label={peer.deviceName || 'Unknown'}
                    isSelected={selectedFingerprint === peer.fingerprint}
                    onClick={() => onSelect(peer.fingerprint)}
                />
            ))}

            {peers.length === 0 && !isLinked && (
                <PillButton
                    icon={Plus}
                    label="Add Devices"
                    onClick={() => openDialog('login')}
                    isSelected={false}
                />
            )}

            {overflowPeers.length > 0 && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={
                            isMacosTheme () ? "w-full" : ""
                            }>
                            <PillButton
                                icon={MoreHorizontal}
                                label="More"
                                isSelected={false}
                                onClick={() => {}}
                            />
                            </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {overflowPeers.map(peer => {
                            const Icon = getDeviceIcon(peer.deviceInfo?.formFactor);
                            return (
                                <DropdownMenuItem
                                    key={peer.fingerprint}
                                    onClick={() => onSelect(peer.fingerprint)}
                                    className={cn(
                                        selectedFingerprint === peer.fingerprint && "bg-accent text-accent-foreground"
                                    )}
                                >
                                    <Icon size={16} className="mr-2" />
                                    <span>{peer.deviceName || 'Unknown'}</span>
                                </DropdownMenuItem>
                            );
                        })}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </div>
    );
}
