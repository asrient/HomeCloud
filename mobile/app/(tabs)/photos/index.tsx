import { Stack } from 'expo-router';
import { Text, View, StyleSheet } from 'react-native';

export default function PhotosScreen() {
  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Photos',
        //   headerStyle: { backgroundColor: '#f4511e' },
        //   headerTintColor: '#fff',
        //   headerTitleStyle: {
        //     fontWeight: 'bold',
        //   },

        //   headerTitle: props => <LogoTitle {...props} />,
        }}
      />
      <Text>Photos Screen</Text>
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
