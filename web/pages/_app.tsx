import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import LoginModal from '@/components/loginModal';
import AppErrorModal from '@/components/appErrorModal';
import AppShell from '@/components/appShell';
import { AppLayout } from '@/components/shell/appLayout';

export default function App({ Component, pageProps }: AppProps) {
  const { sidebarType, noAppShell } = pageProps;

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
    </AppStateProvider>
  );
}
