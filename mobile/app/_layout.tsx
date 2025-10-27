import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/useColorScheme';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { initModules } from '@/lib/init';
import { useAppState } from '@/hooks/useAppState';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options.
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [modulesLoaded, setModulesLoaded] = useState(false);
  const { loadAppState, clearSignals, isInitialized } = useAppState();

  useEffect(() => {
    async function loadModules() {
      try {
        await initModules();
        loadAppState();
        setModulesLoaded(true);
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
  }, [clearSignals, loadAppState]);

  const onLayoutRootView = useCallback(() => {
    if (modulesLoaded && isInitialized) {
      // This tells the splash screen to hide immediately! If we call this after
      // `setAppIsReady`, then we may see a blank screen while the app is
      // loading its initial state and rendering its first pixels. So instead,
      // we hide the splash screen once we know the root view has already
      // performed layout.
      SplashScreen.hide();
    }
  }, [isInitialized, modulesLoaded]);

  if (!modulesLoaded || !isInitialized) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Home' }} />
          <Stack.Screen name="settings" options={{
            title: 'Settings',
            headerBackButtonDisplayMode: 'minimal',
            headerLargeTitle: true,
            headerShadowVisible: false,
            headerTransparent: true,
          }} />
          <Stack.Screen name="welcome" options={{
            headerShown: false,
            presentation: 'modal',
          }} />
          <Stack.Screen name="login" options={{
            headerShown: false,
            presentation: 'modal',
          }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </View>
  );
}
