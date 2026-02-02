import { StyleSheet, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { useRouter } from 'expo-router';
import { useAccountState } from '@/hooks/useAccountState';
import { UIButton } from '@/components/ui/UIButton';
import { getAppName } from '@/lib/utils';

export default function WelcomeScreen() {

    const router = useRouter();
    const { isLinked } = useAccountState();

    const handleGetStarted = async () => {
        // First mark onboarded
        const localSc = modules.getLocalServiceController();
        await localSc.app.setOnboarded(true);
        if (isLinked) {
            // If account is already linked, go to main app
            router.replace('/');
            return;
        }
        // Handle get started action
        router.replace('/login');
    };

    return (
        <UIView themeColor='backgroundSecondary' style={styles.container}>
            <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
            <View style={{ padding: 5 }} >
                <UIText type="title">Welcome to {getAppName()}</UIText>
            </View>
            <View style={styles.footer}>
                <UIButton size='lg' stretch onPress={handleGetStarted} title="Get Started" />
            </View>
        </UIView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 40,
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
        justifyContent: 'center',
    }
});
