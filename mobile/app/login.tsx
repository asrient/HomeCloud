import { useRouter } from 'expo-router';
import { LoginScreen } from '@/components/LoginScreen';

export default function LoginRoute() {
    const router = useRouter();

    const closeScreen = () => {
        router.replace('/');
    };

    return <LoginScreen onComplete={closeScreen} />;
}

