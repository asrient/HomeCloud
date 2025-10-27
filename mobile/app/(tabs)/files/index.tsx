import { Stack } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

export default function FileScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Files',
        //   headerStyle: { backgroundColor: '#f4511e' },
        //   headerTintColor: '#fff',
        //   headerTitleStyle: {
        //     fontWeight: 'bold',
        //   },

        //   headerTitle: props => <LogoTitle {...props} />,
        }}
      />
      <Text>Files Screen</Text>
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
