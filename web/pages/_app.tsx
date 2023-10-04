import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import LoginModal from '@/components/loginModal';
import AppErrorModal from '@/components/appErrorModal';
import AppShell from '@/components/appShell';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppStateProvider>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
      <LoginModal />
      <AppErrorModal />
    </AppStateProvider>
  );
}
