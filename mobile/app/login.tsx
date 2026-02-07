import { StyleSheet, Platform, View, KeyboardAvoidingView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { UITextInput } from '@/components/ui/UITextInput';
import { useMemo, useRef, useState } from 'react';
import { AccountLinkResponse } from 'shared/types';
import { useRouter } from 'expo-router';
import { UIButton } from '@/components/ui/UIButton';
import { SafeAreaView } from 'react-native-safe-area-context';


type OnboardingStep = 'email' | 'otp';

const OTP_LENGTH = 6;

export default function LoginScreen() {

    const router = useRouter();

    const previousEmail = useMemo(() => {
        const localSc = window.modules.getLocalServiceController();
        return localSc.account.getAccountEmail();
    }, []);

    const [emailValue, setEmailValue] = useState(previousEmail || '');
    const [otpValue, setOtpValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const isLoadingRef = useRef(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [linkData, setLinkData] = useState<AccountLinkResponse | null>(null);

    const isEmailValid = useMemo(() => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(emailValue);
    }, [emailValue]);

    const currentStep: OnboardingStep = useMemo(() => {
        return linkData ? 'otp' : 'email';
    }, [linkData]);

    const closeScreen = () => {
        router.replace('/');
    };

    const submitEmail = async () => {
        if (!isEmailValid) {
            return;
        }
        if (isLoadingRef.current) {
            return;
        }
        isLoadingRef.current = true;
        setErrorMessage(null);
        setIsLoading(true);
        const localSc = modules.getLocalServiceController();
        try {
            const linkData = await localSc.app.linkAccount(emailValue);
            if (!linkData.requiresVerification) {
                console.log('Account can be linked without OTP');
                await localSc.account.verifyLink(linkData.requestId, null);
                closeScreen();
                return;
            }
            setLinkData(linkData);
            setOtpValue('');
        } catch (error) {
            console.error('Error linking account:', error);
            setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const submitOtp = async () => {
        if (isLoadingRef.current) {
            return;
        }
        if (!linkData) {
            return;
        }
        isLoadingRef.current = true;
        setErrorMessage(null);
        setIsLoading(true);
        try {
            const localSc = window.modules.getLocalServiceController();
            await localSc.account.verifyLink(linkData.requestId, otpValue);
            console.log('Account linked successfully');
            closeScreen();
        } catch (error) {
            console.error('Error linking account:', error);
            setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    const backToEmailStep = () => {
        setLinkData(null);
        setErrorMessage(null);
        setOtpValue('');
    };

    return (
        <UIView themeColor='backgroundSecondary' style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
                <View style={styles.topBar}>
                    <UIButton type='link' onPress={closeScreen} title='Skip' />
                </View>
                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <UIText size='xxl' font='regular'>
                        {
                            currentStep === 'email' ?
                                'Account Setup' :
                                'Verify OTP'
                        }
                    </UIText>
                    <View style={{ marginTop: 20 }}>
                        {currentStep === 'email' ? (
                            <UITextInput
                                placeholder="Enter your email"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                value={emailValue}
                                onChangeText={setEmailValue}
                                editable={!isLoading}
                            />
                        ) : (
                            <UITextInput
                                placeholder="Enter OTP"
                                keyboardType="number-pad"
                                value={otpValue}
                                onChangeText={setOtpValue}
                                maxLength={OTP_LENGTH}
                                editable={!isLoading}
                            />
                        )}
                        {errorMessage && (
                            <UIText style={{ color: 'red', marginTop: 8 }}>
                                {errorMessage}
                            </UIText>
                        )}
                        {
                            currentStep === 'otp' && (
                                <UIButton type='link' onPress={backToEmailStep} title="Change Email" disabled={isLoading} />
                            )
                        }
                    </View>

                    <View style={{ paddingTop: 20 }}>
                        {
                            currentStep === 'email' ? (
                                <UIButton size='lg' stretch onPress={submitEmail} title='Continue' disabled={!isEmailValid || isLoading} />
                            ) : (
                                <UIButton size='lg' stretch onPress={submitOtp} title='Verify' disabled={otpValue.length !== OTP_LENGTH || isLoading} />
                            )
                        }
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </UIView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
    },
    safeArea: {
        flex: 1,
        padding: 20,
    },
});
