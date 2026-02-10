import { StyleSheet, Platform, View, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { UIText } from '@/components/ui/UIText';
import { useAccountState } from '@/hooks/useAccountState';
import { UIButton } from '@/components/ui/UIButton';
import { getAppName, getLocalServiceController } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppState } from '@/hooks/useAppState';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UIIcon } from '@/components/ui/UIIcon';
import { UIView } from '@/components/ui/UIView';
import { LoginModal } from '@/components/LoginModal';
import { useState } from 'react';

const features = [
    {
        icon: 'cloud.rain' as const,
        title: 'No cloud storage.',
        description: "You don't need a cloud subscription to access your media across your devices.",
    },
    {
        icon: 'antenna.radiowaves.left.and.right' as const,
        title: 'Always connected.',
        description: "Don't worry about WiFi networks or internet access, it just works.",
    },
    {
        icon: 'play.circle' as const,
        title: 'Documents, photos and more.',
        description: 'Browse it, open it, edit it, transfer it, to any device.',
    },
];

export default function WelcomeScreen() {

    const { isLinked } = useAccountState();
    const { requestPermissions } = usePermissions();
    const { setOnboarded } = useAppState();
    const [showLogin, setShowLogin] = useState(false);

    const completeOnboarding = async () => {
        await requestPermissions();
        await getLocalServiceController().setUserOnboarded();
        setOnboarded(true);
    };

    const handleGetStarted = () => {
        if (!isLinked || modules.config.IS_DEV) {
            setShowLogin(true);
        } else {
            completeOnboarding();
        }
    };

    const handleLoginComplete = () => {
        setShowLogin(false);
        completeOnboarding();
    };

    return (
        <UIView style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />

                <View style={styles.header}>
                    <Image
                        source={require('@/assets/images/app-icon.png')}
                        style={styles.appIcon}
                    />
                    <UIText style={styles.welcomeText} color="highlight" font='regular' type='title'>Welcome to</UIText>
                    <UIText type="title" style={styles.appName}>{getAppName()}</UIText>
                </View>

                <View style={styles.featureList}>
                    {features.map((feature, index) => (
                        <View key={index} style={styles.featureRow}>
                            <View style={styles.featureIconContainer}>
                                <UIIcon name={feature.icon} size={38} themeColor="highlight" />
                            </View>
                            <View style={styles.featureTextContainer}>
                                <UIText font="semibold" color="highlight" size="md">{feature.title}</UIText>
                                <UIText size="md" color="text" style={styles.featureDescription}>{feature.description}</UIText>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.footer}>
                    <UIButton size='lg' stretch onPress={handleGetStarted} title="Continue" />
                </View>
            </SafeAreaView>
            <LoginModal visible={showLogin} onComplete={handleLoginComplete} />
        </UIView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
        paddingHorizontal: 22,
        paddingVertical: 10,
        maxWidth: 450,
        maxHeight: 900,
        width: '100%',
        alignSelf: 'center',
    },
    header: {
        marginTop: 60,
    },
    appIcon: {
        width: 86,
        height: 86,
        marginBottom: 20,
    },
    welcomeText: {
        marginBottom: 2,
    },
    appName: {
        fontSize: 34,
    },
    featureList: {
        gap: 28,
    },
    featureRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16,
    },
    featureIconContainer: {
        width: 48,
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureTextContainer: {
        flex: 1,
    },
    featureDescription: {
        marginTop: 4,
    },
    footer: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
