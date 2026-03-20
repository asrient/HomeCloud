import { Button } from "@/components/ui/button"
import { useRouter } from "next/router";
import { DeviceSwitcher } from "../deviceSwitcher";
import { ArrowLeft, Settings } from 'lucide-react';
import { useNavigation } from "../hooks/useNavigation";
import { getAppName } from "@/lib/utils";
import { settingsUrl } from "@/lib/urls";

export default function AppHeader() {
    const router = useRouter();
    const { canGoBack, goBack } = useNavigation();

    return (<div className="flex items-center px-2 py-1 h-[2.6rem] text-xs select-none">
        {/* Spacing for titlebars with controls on left side */}
        <div className="app-titlebar-space-start"></div>
        <div className="shrink-0 h-full flex items-center">
            <div className="flex items-center">
                <Button size='sm' disabled={!canGoBack} variant='ghost' className="text-primary" title="Back" onClick={goBack}>
                    <ArrowLeft size={20} />
                </Button>
            </div>
            <div className="h-full app-dragable flex items-center pl-2">
                {getAppName()}
            </div>
        </div>
        <div className="grow h-full w-full app-dragable">
        </div>
        <div className="mx-1 shrink-0">
            <DeviceSwitcher width='25rem' />
        </div>
        <div className="shrink-0">
            <Button size='sm' variant='ghost' className="text-muted-foreground hover:text-foreground" title="Settings" onClick={() => router.push(settingsUrl())}>
                <Settings size={16} />
            </Button>
        </div>
        <div className="grow h-full w-full app-dragable">
        </div>
    </div>)
}
