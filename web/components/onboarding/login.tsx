import {
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { Button } from "../ui/button";
import { cn, isMacosTheme } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { AtSign, RectangleEllipsis } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { AccountLinkResponse } from "shared/types";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { getAppName } from "@/lib/utils";

type OnboardingStep = 'email' | 'otp';

const OTP_LENGTH = 6;

export function LoginPage() {
    const { closeDialog, opts } = useOnboardingStore();

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
        const localSc = window.modules.getLocalServiceController();
        try {
            const linkData = await localSc.app.linkAccount(emailValue);
            if (!linkData.requiresVerification) {
                console.log('Account can be linked without OTP');
                await localSc.account.verifyLink(linkData.requestId, null);
                closeDialog();
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
            if (opts.reloadOnFinish) {
                window.location.reload();
            } else {
                closeDialog();
            }
        } catch (error) {
            console.error('Error linking account:', error);
            setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
            isLoadingRef.current = false;
        }
    };

    return (
        <>
            <DialogHeader>
                <DialogTitle>Setup account</DialogTitle>
            </DialogHeader>

            <div className="h-[20rem] max-h-[50vh] my-2 flex flex-col items-center justify-center text-center">
                {
                    currentStep === 'email' ?
                        <AtSign className="mb-4 text-primary" size={50} /> :
                        <RectangleEllipsis className="mb-4 text-primary" size={50} />
                }
                <p className="text-sm text-foreground/70 mb-4 w-96">
                    {
                        currentStep === 'email' ?
                            `To manage secure access across your devices, ${getAppName()} requires you to set up an account.` :
                            'We have sent a one-time password (OTP) to your email.'
                    }
                </p>
                {
                    currentStep === 'email' && <Input type="email"
                        placeholder="Your Email"
                        className="mb-2 w-64"
                        disabled={isLoading}
                        value={emailValue}
                        autoFocus
                        onChange={(e) => setEmailValue(e.target.value)}
                    />
                }
                {
                    currentStep === 'otp' &&
                    <InputOTP disabled={isLoading}
                        value={otpValue} maxLength={6} onChange={(e) => {
                            setOtpValue(e);
                        }} >
                        <InputOTPGroup>
                            {Array.from({ length: OTP_LENGTH }).map((_, idx) => (
                                <InputOTPSlot index={idx} key={idx} />
                            ))}
                        </InputOTPGroup>
                    </InputOTP>
                }
                {
                    errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>
                }
                {
                    currentStep === 'email' && !errorMessage && <p className="text-xs text-foreground/70">
                        Its always free and we won't spam your inbox.
                    </p>
                }
            </div>

            <DialogFooter className="mt-auto">
                <Button variant={'ghost'} size='platform'
                    onClick={() => {
                        if (currentStep === 'email') {
                            closeDialog();
                        } else {
                            setLinkData(null);
                        }
                    }}
                >
                    {
                        currentStep === 'email' ? 'Not now' : 'Back'
                    }
                </Button>
                <Button
                    disabled={(currentStep === 'email' ? !isEmailValid : otpValue.length !== OTP_LENGTH) || isLoading}
                    size='platform'
                    onClick={() => {
                        if (currentStep === 'email') {
                            submitEmail();
                        } else {
                            submitOtp();
                        }
                    }}>
                    {
                        currentStep === 'email' ? 'Continue' : 'Verify'
                    }
                </Button>
            </DialogFooter>
        </>)
}
