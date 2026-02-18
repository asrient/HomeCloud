import {
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { Button } from "../ui/button";
import { cn, isMacosTheme, getAppName } from "@/lib/utils";
import Image from "next/image";

function Bulletin({ icon, title, description }: { icon: string; title: string; description: string }) {
    return (
        <div className="flex items-start gap-4 px-4 py-3">
            <Image src={icon} alt={title} width={40} height={40} className="shrink-0 mt-0.5" />
            <div className="flex flex-col">
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm text-foreground/70">{description}</p>
            </div>
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
            <div className="flex flex-col items-center pt-6 pb-2">
                <Image
                    src="/icons/icon.png"
                    alt={getAppName()}
                    width={72}
                    height={72}
                    className="rounded-2xl mb-4"
                />
                <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-center">
                        Welcome to {getAppName()}
                    </DialogTitle>
                </DialogHeader>
            </div>
            <div className="flex flex-col gap-1 py-4 px-4 max-w-md mx-auto">
                <Bulletin
                    icon="/icons/devices.png"
                    title="Transfer files, browse photos & more"
                    description="Transfer unlimited files, share your clipboard, browse photos and edit documents across all your devices."
                />
                <Bulletin
                    icon="/icons/internet.png"
                    title="Always connected"
                    description="Works over your local network or remotely over the internet, with direct device-to-device connections."
                />
                <Bulletin
                    icon="/icons/lock.png"
                    title="Private & encrypted"
                    description="Your data is end-to-end encrypted and travels directly between your devices."
                />
            </div>
            <DialogFooter className="flex sm:justify-center sm:items-center sm:w-full">
                <Button size='platform' variant='default' stretch onClick={handleNext}>
                    Continue
                </Button>
            </DialogFooter>
        </>)
}
