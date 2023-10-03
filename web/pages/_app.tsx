import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import AppStateProvider from '@/components/appStateProvider';
import LoginModal from '@/components/loginModal';
import AppErrorModal from '@/components/appErrorModal';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppStateProvider>
      <Component {...pageProps} />
      <LoginModal />
      <AppErrorModal />
    </AppStateProvider>
  );
}
