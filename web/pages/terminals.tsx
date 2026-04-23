import { PageBar, PageContent, PagePlaceholder, MenuButton, MenuGroup } from "@/components/pagePrimatives";
import { buildPageConfig } from '@/lib/utils'
import Head from 'next/head'
import { useCallback, useState } from 'react'
import { ThemedIconName } from "@/lib/enums";
import { useAppState } from "@/components/hooks/useAppState";
import { useTerminalSessions } from "@/components/hooks/useTerminalSessions";
import { TerminalSessionCard } from "@/components/terminals/TerminalSessionCard";
import { Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import ConfirmModal from "@/components/confirmModal";
import LoadingIcon from "@/components/ui/loadingIcon";

function Page() {
    const { selectedFingerprint } = useAppState();
    const { sessions, isLoading, error, createSession, killSession, isSessionsSupported } = useTerminalSessions(selectedFingerprint);
    const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

    const handleNew = useCallback(async () => {
        try {
            if (isSessionsSupported) {
                const entry = await createSession();
                window.utils.openTerminalWindow!(selectedFingerprint, entry.sessionId);
            } else {
                window.utils.openTerminalWindow!(selectedFingerprint);
            }
        } catch (e: any) {
            console.error(e);
            const localSc = window.modules.getLocalServiceController();
            localSc.system.alert('Failed to open terminal', e?.message ?? String(e));
        }
    }, [isSessionsSupported, createSession, selectedFingerprint]);

    const openSession = useCallback((sessionId: string) => {
        window.utils.openTerminalWindow!(selectedFingerprint, sessionId);
    }, [selectedFingerprint]);

    const handleKillConfirm = useCallback(async () => {
        if (!deleteSessionId) return;
        await killSession(deleteSessionId);
        setDeleteSessionId(null);
    }, [deleteSessionId, killSession]);

    const content = () => {
        if (isLoading && sessions.length === 0) {
            return <div className="h-full flex items-center justify-center"><LoadingIcon /></div>;
        }
        if (error) {
            return <PagePlaceholder title="Terminal not available" detail={error} />;
        }
        if (!isSessionsSupported) {
            return (
                <PagePlaceholder title="Start a temporary terminal" detail="Update the device to use the new enhanced terminal with background sessions.">
                    <Button variant='secondary' onClick={handleNew}>
                        New Terminal
                    </Button>
                </PagePlaceholder>
            );
        }
        if (sessions.length === 0) {
            return (
                <PagePlaceholder title="Active sessions will show here" detail="Sessions can keep running in the background.">
                    <Button variant='secondary' onClick={handleNew}>
                        New Session
                    </Button>
                </PagePlaceholder>
            );
        }
        return (
            <>
                <div className="p-4 grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3">
                    {sessions.map(session => (
                        <TerminalSessionCard
                            key={session.sessionId}
                            session={session}
                            onClick={() => openSession(session.sessionId)}
                            onKill={() => setDeleteSessionId(session.sessionId)}
                        />
                    ))}
                </div>
                <ConfirmModal
                    title="Kill session?"
                    description="This will terminate the terminal session and any running processes."
                    buttonText="Kill"
                    buttonVariant="destructive"
                    isOpen={deleteSessionId !== null}
                    onOpenChange={(open) => { if (!open) setDeleteSessionId(null); }}
                    onConfirm={handleKillConfirm}
                />
            </>
        );
    };

    return (
        <>
            <Head>
                <title>Terminal</title>
            </Head>
            <PageBar icon={ThemedIconName.Terminal} title="Terminal">
                {!error && !isLoading && (
                    <MenuGroup>
                        <MenuButton title="New Session" onClick={handleNew}>
                            <Plus size={16} />
                        </MenuButton>
                    </MenuGroup>
                )}
            </PageBar>
            <PageContent>
                {content()}
            </PageContent>
        </>
    );
}

Page.config = buildPageConfig()
export default Page
