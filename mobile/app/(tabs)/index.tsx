import { StyleSheet, View, Button } from 'react-native';

import { UIText } from '@/components/ui/UIText';
import { Link, useRouter } from 'expo-router';

export default function HomeScreen() {

  const router = useRouter();

  const openLogin = () => {
    router.navigate('/login');
  };

  return (
    <View style={styles.container}>
      <UIText style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16 }}>
        Media Center
      </UIText>
      <Link href="/settings">
        Settings
      </Link>
      <Button title="Login" onPress={openLogin} />
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
