import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import SplashScreen from '@/components/splashScreen';
import AppErrorModal from '@/components/appErrorModal';
import AppShell from '@/components/appShell';
import { AppLayout } from '@/components/shell/appLayout';
import type { NextPage } from 'next'
import { PageUIConfig } from '@/lib/types';
import { Toaster } from "@/components/ui/toaster";
import { useAppState } from '@/components/hooks/useAppState';
import { useDarkMode, useUIThemeClass } from '@/components/hooks/useDarkMode';
import { useEffect } from 'react';

export type NextPageWithConfig<P = {}, IP = P> = NextPage<P, IP> & {
  config?: PageUIConfig;
}

type AppPropsWithConfig = AppProps & {
  Component: NextPageWithConfig;
}

function App({ Component, pageProps }: AppPropsWithConfig) {
  const { noAppShell } = Component.config || {};
  const { isInitalized } = useAppState();

  if (!isInitalized) {
    return <SplashScreen />
  }
  return (
    <>
      {
        noAppShell
          ? <Component {...pageProps} />
          : (
            <AppShell>
              <AppLayout>
                <Component {...pageProps} />
              </AppLayout>
            </AppShell>
          )
      }
      <AppErrorModal />
      <Toaster />
    </>
  );
}

export default function MyApp(props: AppPropsWithConfig) {
  useDarkMode();
  useUIThemeClass();

  // Prevent zoom with Ctrl+/- or Ctrl+scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  return (<AppStateProvider>
    <App {...props} />
  </AppStateProvider>)
}
