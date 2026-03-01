import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { PageBar, PageContent } from '@/components/pagePrimatives';
import { ThemedIconName } from '@/lib/enums';
import { getServiceController, buildPageConfig, cn, isMacosTheme, getAppName } from '@/lib/utils';
import { RemoteAppInfo } from 'shared/types';
import LoadingIcon from '@/components/ui/loadingIcon';
import { NextPageWithConfig } from '@/pages/_app';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildNextUrl } from '@/lib/urls';
import { useRunningApps, useInstalledApps, useAppIcon } from '@/components/hooks/useApps';

const MIN_WINDOW_SIZE = 10;

function AppItem({ app, fingerprint, onClick }: { app: RemoteAppInfo; fingerprint: string | null; onClick: () => void }) {
    const iconUri = useAppIcon(app.id, fingerprint);

    return (
        <button
            onClick={onClick}
            className={cn(
                'flex flex-col items-center justify-center gap-2 p-3 rounded-lg',
                'hover:bg-accent/50 transition-colors cursor-pointer',
                'w-[100px] text-center'
            )}
        >
            <div className='w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden'>
                {iconUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={iconUri}
                        alt={app.name}
                        className='w-full h-full object-cover'
                    />
                ) : (
                    <span className='text-lg font-semibold text-muted-foreground'>
                        {app.name.charAt(0)}
                    </span>
                )}
            </div>
            <span className='text-xs text-foreground truncate w-full'>
                {app.name}
            </span>
        </button>
    );
}

function AppGrid({ apps, fingerprint, onAppClick }: { apps: RemoteAppInfo[]; fingerprint: string | null; onAppClick: (app: RemoteAppInfo) => void }) {
    if (apps.length === 0) {
        return (
            <div className='flex items-center justify-center py-16 text-muted-foreground text-sm'>
                No apps found.
            </div>
        );
    }

    return (
        <div className='flex flex-wrap gap-1 p-2'>
            {apps.map((app) => (
                <AppItem key={app.id} app={app} fingerprint={fingerprint} onClick={() => onAppClick(app)} />
            ))}
        </div>
    );
}

const Page: NextPageWithConfig = () => {
    const router = useRouter();
    const { fingerprint: fingerprintStr } = router.query as { fingerprint?: string };
    const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

    const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { runningApps, isLoading: runningLoading, error: runningError, reload } = useRunningApps(
        fingerprint,
    );
    const { installedApps, isLoading: installedLoading, error: installedError } = useInstalledApps(fingerprint);
    const isLoading = runningLoading || installedLoading;
    const error = actionError || runningError || installedError;

    const openAppWindows = useCallback(async (app: RemoteAppInfo) => {
        try {
            const sc = await getServiceController(fingerprint);
            const allWindows = await sc.apps.getWindows(app.id);
            const appWindows = allWindows.filter(w => w.width >= MIN_WINDOW_SIZE && w.height >= MIN_WINDOW_SIZE);
            if (appWindows.length === 0) {
                setActionError(`No windows found for ${app.name}`);
                return;
            }
            // Desktop (Electron): open each window in its own BrowserWindow
            for (const w of appWindows) {
                if (window.utils?.openAppWindow) {
                    window.utils.openAppWindow(w, fingerprint, app.id);
                }
            }

        } catch (e: any) {
            console.error('Failed to open app windows:', e);
            setActionError(`Failed to open ${app.name}`);
        }
    }, [fingerprint]);

    const handleAppClick = useCallback(async (app: RemoteAppInfo, isRunning: boolean) => {
        if (isRunning) {
            openAppWindows(app);
            return;
        }

        // Launch app, then open windows
        setLaunchingAppId(app.id);
        try {
            const sc = await getServiceController(fingerprint);
            await sc.apps.launchApp(app.id);
            // Wait briefly for the app to start
            await new Promise((resolve) => setTimeout(resolve, 1500));
            openAppWindows(app);
        } catch (e: any) {
            console.error('Failed to launch app:', e);
            setActionError(`Failed to launch ${app.name}`);
        } finally {
            setLaunchingAppId(null);
        }
    }, [fingerprint, openAppWindows]);

    const runningAppIds = useMemo(() => new Set(runningApps.map((a) => a.id)), [runningApps]);

    // Installed apps excluding running ones
    const otherInstalledApps = useMemo(
        () => installedApps.filter((a) => !runningAppIds.has(a.id)),
        [installedApps, runningAppIds]
    );

    return (
        <>
            <Head>
                <title>Apps - {getAppName()}</title>
            </Head>
            <PageBar title='Apps' icon={ThemedIconName.Apps} />
            <PageContent>
                {isLoading ? (
                    <div className='flex items-center justify-center py-20'>
                        <LoadingIcon className='h-8 w-8 mr-2' />
                        <span className='text-muted-foreground'>Loading apps...</span>
                    </div>
                ) : error ? (
                    <div className='flex flex-col items-center justify-center py-20 text-destructive'>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor" className="h-8 w-8 mb-2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                        </svg>
                        <span>{error}</span>
                        <button
                            className='mt-3 text-sm text-primary underline'
                            onClick={reload}
                        >
                            Retry
                        </button>
                    </div>
                ) : (
                    <Tabs defaultValue='running' className='w-full'>
                        <div className={cn('px-4', isMacosTheme() ? 'pt-2' : 'pt-4')}>
                            <TabsList>
                                <TabsTrigger value='running'>
                                    Running ({runningApps.length})
                                </TabsTrigger>
                                <TabsTrigger value='installed'>
                                    Installed ({otherInstalledApps.length})
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <TabsContent value='running' className='px-4'>
                            <AppGrid
                                apps={runningApps}
                                fingerprint={fingerprint}
                                onAppClick={(app) => handleAppClick(app, true)}
                            />
                        </TabsContent>
                        <TabsContent value='installed' className='px-4'>
                            {launchingAppId && (
                                <div className='flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground'>
                                    <LoadingIcon className='h-4 w-4' />
                                    Launching...
                                </div>
                            )}
                            <AppGrid
                                apps={otherInstalledApps}
                                fingerprint={fingerprint}
                                onAppClick={(app) => handleAppClick(app, false)}
                            />
                        </TabsContent>
                    </Tabs>
                )}
            </PageContent>
        </>
    );
};

Page.config = buildPageConfig();
export default Page;
