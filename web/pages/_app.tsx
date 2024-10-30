import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import SplashScreen from '@/components/splashScreen';
import AppErrorModal from '@/components/appErrorModal';
import AppShell from '@/components/appShell';
import { AppLayout, MainContent } from '@/components/shell/appLayout';
import type { NextPage } from 'next'
import { PageUIConfig } from '@/lib/types';
import { Toaster } from "@/components/ui/toaster";
import { useAppState } from '@/components/hooks/useAppState';

export type NextPageWithConfig<P = {}, IP = P> = NextPage<P, IP> & {
  config?: PageUIConfig;
}

type AppPropsWithConfig = AppProps & {
  Component: NextPageWithConfig;
}

function App({ Component, pageProps }: AppPropsWithConfig) {
  const { sidebarType, noAppShell } = Component.config || {};
  const { profile } = useAppState();
  if (!profile) {
    return <SplashScreen />
  }
  return (
    <>
      {
        noAppShell
          ? <Component {...pageProps} />
          : (
            <AppShell>
              {
                !sidebarType
                  ? <MainContent>
                    <Component {...pageProps} />
                  </MainContent>
                  : (<AppLayout sidebarType={sidebarType}>
                    <Component {...pageProps} />
                  </AppLayout>)
              }
            </AppShell>
          )
      }
      <AppErrorModal />
      <Toaster />
      </>
  );
}

export default function MyApp(props: AppPropsWithConfig) {
  return (<AppStateProvider>
  <App {...props} />
    </AppStateProvider>)
}
