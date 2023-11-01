import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import LoginModal from '@/components/loginModal';
import AppErrorModal from '@/components/appErrorModal';
import AppShell from '@/components/appShell';
import { AppLayout } from '@/components/shell/appLayout';
import type { NextPage } from 'next'
import { PageUIConfig } from '@/lib/types';
import { Toaster } from "@/components/ui/toaster";

export type NextPageWithConfig<P = {}, IP = P> = NextPage<P, IP> & {
  config?: PageUIConfig;
}

type AppPropsWithConfig = AppProps & {
  Component: NextPageWithConfig;
}

export default function App({ Component, pageProps }: AppPropsWithConfig) {
  const { sidebarType, noAppShell } = Component.config || {};

  return (
    <AppStateProvider>
      {
        noAppShell
          ? <Component {...pageProps} />
          : (
            <AppShell>
              {
                !sidebarType
                  ? <Component {...pageProps} />
                  : (<AppLayout sidebarType={sidebarType}>
                    <Component {...pageProps} />
                  </AppLayout>)
              }
            </AppShell>
          )
      }
      <LoginModal />
      <AppErrorModal />
      <Toaster />
    </AppStateProvider>
  );
}
