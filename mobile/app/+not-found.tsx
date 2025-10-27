import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { UIText } from '@/components/ui/UIText';
import { UIView } from '@/components/ui/UIView';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <UIView style={styles.container}>
        <UIText type="title">This screen does not exist.</UIText>
        <Link href="/" style={styles.link}>
          <UIText type="link">Go to home screen!</UIText>
        </Link>
      </UIView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
