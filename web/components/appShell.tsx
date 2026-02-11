import React from 'react';
import AppHeader from './shell/appHeader';
import { isMacosTheme } from '@/lib/utils';
import OnboardModal from './onboarding/onboardModal';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <OnboardModal />
      {!isMacosTheme() && <AppHeader />}
      {children}
    </>
  );
}
