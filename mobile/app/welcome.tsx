import { StyleSheet, Platform, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { useRouter } from 'expo-router';
import { useAccountState } from '@/hooks/useAccountState';
import { UIButton } from '@/components/ui/UIButton';
import { getAppName, getLocalServiceController } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppState } from '@/hooks/useAppState';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {

    const router = useRouter();
    const { isLinked } = useAccountState();
    const { requestPermissions } = usePermissions();
    const { setOnboarded } = useAppState();

    const handleGetStarted = async () => {
        await requestPermissions();
        await getLocalServiceController().setUserOnboarded();
        setOnboarded(true);
        if (!isLinked || modules.config.IS_DEV) {
            router.navigate('/login');
        }
    };

    return (
        <UIView themeColor='backgroundSecondary' style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
                <View style={{ padding: 5 }} >
                    <UIText type="title">Welcome to {getAppName()}</UIText>
                </View>
                <View style={styles.footer}>
                    <UIButton size='lg' stretch onPress={handleGetStarted} title="Get Started" />
                </View>
            </SafeAreaView>
        </UIView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 20,
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
        justifyContent: 'center',
    }
});
