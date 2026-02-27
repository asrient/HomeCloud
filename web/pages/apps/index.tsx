import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { PageBar, PageContent } from '@/components/pagePrimatives';
import { ThemedIconName } from '@/lib/enums';
import { getServiceController, buildPageConfig, cn, isMacosTheme, getAppName } from '@/lib/utils';
import { useAppState } from '@/components/hooks/useAppState';
import { RemoteAppInfo } from 'shared/types';
import LoadingIcon from '@/components/ui/loadingIcon';
import { NextPageWithConfig } from '@/pages/_app';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buildNextUrl } from '@/lib/urls';

function useAppIcon(appId: string, fingerprint: string | null) {
  const [iconUri, setIconUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sc = await getServiceController(fingerprint);
        const uri = await sc.apps.getAppIcon(appId);
        if (!cancelled && uri) setIconUri(uri);
      } catch (e) {
        console.error(`Failed to load icon for ${appId}:`, e);
      }
    })();
    return () => { cancelled = true; };
  }, [appId, fingerprint]);

  return iconUri;
}

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

  const [runningApps, setRunningApps] = useState<RemoteAppInfo[]>([]);
  const [installedApps, setInstalledApps] = useState<RemoteAppInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launchingAppId, setLaunchingAppId] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const sc = await getServiceController(fingerprint);
      const [running, installed] = await Promise.all([
        sc.apps.getRunningApps(),
        sc.apps.getInstalledApps(),
      ]);
      setRunningApps(running);
      setInstalledApps(installed);
    } catch (e: any) {
      console.error('Failed to load apps:', e);
      setError(e.message || 'Failed to load apps');
    } finally {
      setIsLoading(false);
    }
  }, [fingerprint]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleAppClick = useCallback(async (app: RemoteAppInfo, isRunning: boolean) => {
    if (isRunning) {
      // Navigate to app page
      router.push(buildNextUrl('/apps/app', { fingerprint, appId: app.id, name: app.name }));
      return;
    }

    // Launch app, then navigate
    setLaunchingAppId(app.id);
    try {
      const sc = await getServiceController(fingerprint);
      await sc.apps.launchApp(app.id);
      // Wait briefly for the app to start
      await new Promise((resolve) => setTimeout(resolve, 1500));
      router.push(buildNextUrl('/apps/app', { fingerprint, appId: app.id, name: app.name }));
    } catch (e: any) {
      console.error('Failed to launch app:', e);
      setError(`Failed to launch ${app.name}`);
    } finally {
      setLaunchingAppId(null);
    }
  }, [fingerprint, router]);

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
              onClick={loadApps}
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
