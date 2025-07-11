import { Image } from 'expo-image';
import { Platform, StyleSheet, View, Text, Button } from 'react-native';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import Signal from 'shared/signals';
import { useEffect } from 'react';
import { runTests, openSettings } from '@/lib/testDeps';

export default function HomeScreen() {

  useEffect(() => {
    const signal = new Signal();
    console.log('Signal created:', signal);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' }}>
      <ThemedText style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        Continuity Center
      </ThemedText>
      <Button title="Run Tests" onPress={runTests} />
      <Button title="Open Settings" onPress={openSettings} />
    </View>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
});
