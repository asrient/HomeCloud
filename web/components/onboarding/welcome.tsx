import {
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/lib/onboardingState";
import { Button } from "../ui/button";
import { cn, isMacosTheme } from "@/lib/utils";
import Image from "next/image";

function Bulletin({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="flex flex-col items-start p-4 max-w-[50%] lg:max-w-[33%]">
            <Image src={icon} alt={title} width={60} height={60} className="mb-1" />
            <h3 className="text-xs font-semibold">{title}</h3>
            <p className="text-xs text-foreground/70">{description}</p>
        </div>
    );
}

function IntroHero() {
    // Placeholder for an introductory carousel component
    return (
        <div className="h-[28rem] max-h-[60vh] overflow-y-auto my-2 flex items-center justify-center flex-wrap">
            <Bulletin
                icon="/icons/devices.png"
                title="Multi-device access"
                description="Access or transfer your media from any device with Media Center."
            />
            <Bulletin
                icon="/icons/photos.png"
                title="Organize photos"
                description="Manage and organize your photo collection across devices with ease."
            />
            <Bulletin
                icon="/icons/folder.png"
                title="Browse documents"
                description="Quickly find and open your documents saved on this or any another device."
            />
            <Bulletin
                icon="/icons/nocloud.png"
                title="No cloud storage"
                description="Skip the hassle of uploading to the cloud to access your media."
            />
            <Bulletin
                icon="/icons/internet.png"
                title="Always connected"
                description="Dont worry about WiFi networks or internet access, Media Center just works."
            />
            <Bulletin
                icon="/icons/lock.png"
                title="No one's watching"
                description="Your media stays private and travels only among your devices, directly."
            />
        </div>
    );
}

export function WelcomePage() {
    const { openDialog } = useOnboardingStore();

    const handleNext = async () => {
        const localSc = window.modules.getLocalServiceController();
        try {
            await localSc.app.setOnboarded(true);
        } catch (error) {
            console.error("Error setting onboarded status:", error);
        }
        openDialog('login');
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle className="text-3xl font-bold">Welcome to Media Center</DialogTitle>
            </DialogHeader>
            <IntroHero />
            <DialogFooter className="mt-auto mx-auto">
                <Button className={cn("w-[12rem]", isMacosTheme() && "rounded-full")} size={isMacosTheme() ? 'sm' : 'default'} onClick={handleNext}>
                    Continue
                </Button>
            </DialogFooter>
        </>)
}
