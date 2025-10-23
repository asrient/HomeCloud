import {
    Dialog,
    DialogContent
} from "@/components/ui/dialog";
import React, { useCallback } from "react";
import { useOnboardingStore } from "@/lib/onboardingState";
import { WelcomePage } from "./welcome";
import { LoginPage } from "./login";

export default function OnboardModal() {
    const { page, closeDialog } = useOnboardingStore();

    const handleClose = useCallback(() => {
        if (page === 'welcome') {
            const localSc = window.modules.getLocalServiceController();
            localSc.app.setOnboarded(true);
        }
        closeDialog();
    }, [closeDialog, page]);

    return (
        <Dialog modal={true} open={!!page} onOpenChange={handleClose}>
            <DialogContent
                onInteractOutside={e => {
                    e.preventDefault();
                }}

                className="w-full md:w-[40rem] max-w-[95vw] max-h-[95vh] min-h-[20rem]">
                {page === 'welcome' && <WelcomePage />}
                {page === 'login' && <LoginPage />}
            </DialogContent>
        </Dialog>
    );
}
