import React from 'react';
import AppHeader from './shell/appHeader';
import { isMacosTheme } from '@/lib/utils';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      {!isMacosTheme() && <AppHeader />}
      {children}
    </>
  );
}
