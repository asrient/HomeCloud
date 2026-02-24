import { Redirect } from 'expo-router';

export default function DeviceIndexRedirect() {
  // Device overview is now shown as a modal from the home screen.
  // This route only exists as a fallback — redirect to home.
  return <Redirect href="/" />;
}
