import { StyleSheet, View } from 'react-native';

import { UIText } from '@/components/ui/UIText';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <UIText style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        Media Center
      </UIText>
      <Link href="/settings">
        Settings
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
