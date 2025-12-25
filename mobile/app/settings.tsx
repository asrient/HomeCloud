
import { StyleSheet, Text, View, ScrollView, Button } from 'react-native';
import { useRouter } from 'expo-router';

export default function SettingsScreen() {
  //const headerHeight = useHeaderHeight();
  const router = useRouter();
    const openLogin = () => {
    router.navigate('/login');
  };
  return (
    <View style={styles.container}>
      <ScrollView style={{ backgroundColor: 'pink', padding: 16 }}>
        <View style={{ minHeight: 2000, marginTop: 200 }}>
          <Button title="Login" onPress={openLogin} />
          <Text>App Settings</Text>
          <Text>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad
            minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat. Duis aute irure dolor in
          </Text>
          <Text>
            reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla
            pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
            culpa qui officia deserunt mollit anim id est laborum.
          </Text>
        </View>
      </ScrollView>
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
