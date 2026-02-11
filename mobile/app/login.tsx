import { useRouter } from 'expo-router';
import { LoginScreen } from '@/components/LoginScreen';
import { View } from 'react-native';

export default function LoginRoute() {
    const router = useRouter();

    const closeScreen = (success: boolean) => {
        if (!success && router.canGoBack()) {
            router.back();
        } else {
            router.replace('/');
        }
    };

    return <View style={{ flex: 1 }}>
        <LoginScreen onComplete={closeScreen} />
    </View>;
}
