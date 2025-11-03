import { Link, Stack, useRouter } from 'expo-router';
import { View, StyleSheet, Button } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  const openLogin = () => {
    router.navigate('/login');
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Home',
          headerTitle: 'Media Center',
          headerTransparent: true,
        }}
      />
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
