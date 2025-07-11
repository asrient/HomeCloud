import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useColorScheme } from '@/hooks/useColorScheme';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { initModules } from '@/lib/init';

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
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    async function loadModules() {
      try {
        await initModules();
        setModulesLoaded(true);
      } catch (error) {
        console.error('Failed to initialize modules:', error);
      }
    }

    loadModules();
    // This effect runs only once when the component mounts.
    // It initializes the modules and sets the state to indicate that they are loaded.
  }, []);

  const onLayoutRootView = useCallback(() => {
    if (modulesLoaded && loaded) {
      // This tells the splash screen to hide immediately! If we call this after
      // `setAppIsReady`, then we may see a blank screen while the app is
      // loading its initial state and rendering its first pixels. So instead,
      // we hide the splash screen once we know the root view has already
      // performed layout.
      SplashScreen.hide();
    }
  }, [modulesLoaded, loaded]);

  if (!loaded || !modulesLoaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </View>
  );
}
