import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { initModules } from '@/lib/init';
import { useAppState } from '@/hooks/useAppState';
import { useKeepAwake } from 'expo-keep-awake';
import { InputPopup } from '@/components/inputPopup';
import { AlertModal } from '@/components/AlertModal';
import { useNavigationTheme } from '@/hooks/useNavigationTheme';
import { usePermissions } from '@/hooks/usePermissions';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
});

export default function RootLayout() {
  const theme = useNavigationTheme();
  const [appReady, setAppReady] = useState(false);
  const { loadAppState, clearSignals, isInitialized, isOnboarded } = useAppState();
  useKeepAwake();
  const { requestPermissions } = usePermissions();

  const setupPermissions = useCallback(async () => {
    const localSc = modules.getLocalServiceController();
    const isOnboarded = localSc.app.isOnboarded();
    if (isOnboarded) {
      // If the user has already onboarded, we can request permissions immediately.
      // This ensures that we have the necessary permissions before the user starts interacting with the app.
      return requestPermissions();
    }
    return true;
  }, [requestPermissions]);

  useEffect(() => {
    async function loadModules() {
      try {
        await initModules();
        loadAppState();
        await setupPermissions();
        setAppReady(true);
      } catch (error) {
        console.error('Failed to initialize modules:', error);
      }
    }

    loadModules();
    // This effect runs only once when the component mounts.
    // It initializes the modules and sets the state to indicate that they are loaded.
    return () => {
      clearSignals();
    };
  }, [clearSignals, loadAppState, setupPermissions]);

  const onLayoutRootView = useCallback(() => {
    if (appReady && isInitialized) {
      // This tells the splash screen to hide immediately! If we call this after
      // `setAppIsReady`, then we may see a blank screen while the app is
      // loading its initial state and rendering its first pixels. So instead,
      // we hide the splash screen once we know the root view has already
      // performed layout.
      SplashScreen.hide();
    }
  }, [isInitialized, appReady]);

  if (!appReady || !isInitialized) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ThemeProvider value={theme}>
        <Stack>
          <Stack.Protected guard={isOnboarded}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
          </Stack.Protected>
          <Stack.Protected guard={!isOnboarded}>
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Screen name="login" options={{
            headerShown: false,
            presentation: 'modal',
          }} />
          <Stack.Screen name="settings" options={{
            title: 'Settings',
            headerBackButtonDisplayMode: 'minimal',
            headerLargeTitle: true,
            headerShadowVisible: false,
            headerTransparent: true,
          }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
        <InputPopup />
        <AlertModal />
      </ThemeProvider>
    </View>
  );
}
