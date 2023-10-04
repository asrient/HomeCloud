import React from 'react';
import AppHeader from './shell/appHeader';

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div>
        <AppHeader />
      {children}
    </div>
  );
}
