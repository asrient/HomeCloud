import { StyleSheet, Platform, View, KeyboardAvoidingView } from 'react-native';
import { UIView } from '@/components/ui/UIView';
import { UIText } from '@/components/ui/UIText';
import { UITextInput } from '@/components/ui/UITextInput';
import { useMemo, useRef, useState } from 'react';
import { AccountLinkResponse } from 'shared/types';
import { UIButton } from '@/components/ui/UIButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UIIcon } from '@/components/ui/UIIcon';
import { getAppName } from '@/lib/utils';


type OnboardingStep = 'email' | 'otp';

const OTP_LENGTH = 6;

interface LoginScreenProps {
    /** Called when the user skips or completes login successfully. */
    onComplete: (success: boolean) => void;
}

export function LoginScreen({ onComplete }: LoginScreenProps) {

    const insets = useSafeAreaInsets();

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
                onComplete(true);
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
            onComplete(true);
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
            <View style={[styles.safeArea, { paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom }]}>
                <View style={styles.topBar}>
                    <UIButton type='link' onPress={() => onComplete(false)} title='Skip' />
                </View>
                <KeyboardAvoidingView
                    style={styles.content}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.iconContainer}>
                        <UIIcon name={
                            currentStep === 'email' ? 'at' : 'envelope.badge'
                        } size={48} themeColor='highlight' />
                    </View>

                    <UIText type='title' font='regular' style={styles.heading}>
                        {
                            currentStep === 'email' ?
                                "Let's set this device up." :
                                'Verify OTP'
                        }
                    </UIText>


                    <UIText size='md' color='textSecondary' style={styles.subtitle}>
                        {
                            currentStep === 'email' ?
                                `To manage secure access across your devices, ${getAppName()} requires you to set up an account.` :
                                'We have sent a one-time password (OTP) to your email.'
                        }
                    </UIText>
                    <View style={styles.inputContainer}>
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
                        {
                            currentStep === 'otp' && (
                                <UIButton type='link' onPress={backToEmailStep} title="Change Email" disabled={isLoading} />
                            )
                        }
                    </View>

                    <View style={styles.buttonContainer}>
                        {
                            currentStep === 'email' ? (
                                <UIButton size='lg' stretch onPress={submitEmail} title='Continue' disabled={!isEmailValid || isLoading} />
                            ) : (
                                <UIButton size='lg' stretch onPress={submitOtp} title='Verify' disabled={otpValue.length !== OTP_LENGTH || isLoading} />
                            )
                        }
                    </View>
                    {
                        (currentStep === 'email' || errorMessage) && (
                            <UIText size='sm' color='textSecondary' style={{ marginTop: 8, paddingHorizontal: 4, textAlign: 'center' }}>
                                {
                                    currentStep === 'email' && !errorMessage ?
                                        "It's always free and we won't spam your inbox." :
                                        errorMessage
                                }
                            </UIText>
                        )
                    }
                </KeyboardAvoidingView>
            </View>
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
        minHeight: 44,
        alignItems: 'center',
    },
    content: {
        flex: 1,
        paddingTop: 40,
        maxWidth: 450,
        width: '100%',
        alignSelf: 'center',
    },
    safeArea: {
        flex: 1,
        padding: 22,
    },
    iconContainer: {
        marginBottom: 24,
    },
    heading: {
        marginBottom: 8,
    },
    subtitle: {
        marginBottom: 24,
    },
    inputContainer: {
        marginTop: 8,
    },
    buttonContainer: {
        paddingTop: 16,
    },
});
