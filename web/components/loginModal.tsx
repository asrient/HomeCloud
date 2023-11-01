import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAppDispatch, useAppState } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import LoginForm from './auth/loginForm';
import ProfileSelector from './auth/profileSelector';
import SignupForm from './auth/signupForm';
import { initalialState } from '@/lib/api/auth';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const LoginModal = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showSwitch, setShowSwitch] = useState(true);
    const [noProfilesAvailable, setNoProfilesAvailable] = useState(false);
    const [activeTab, setActiveTab] = useState<string>("login");
    const { serverConfig, profile, isInitalized } = useAppState();
    const [error, setError] = useState<string | null>(null);
    const dispatch = useAppDispatch();

    useEffect(() => {
        setIsOpen(isInitalized && !profile);
    }, [profile, isInitalized]);

    useEffect(() => {
        if (serverConfig) {
            if (!serverConfig.allowSignups) {
                if (activeTab === "signup") {
                    setActiveTab("login");
                }
                setShowSwitch(false);
            } else {
                if(!noProfilesAvailable) {
                    setShowSwitch(true);
                } else {
                    setShowSwitch(false);
                    setActiveTab("signup");
                }
            }
        }
    }, [activeTab, serverConfig, setShowSwitch, setActiveTab, noProfilesAvailable]);

    const handleLoginSucess = useCallback(async () => {
        try {
            const data = await initalialState();
            dispatch(ActionTypes.INITIALIZE, data);
        } catch (error: any) {
            console.error(error);
            setError('Error: ' + error.message);
        }
    }, [dispatch]);

    const handleNoProfiles = () => {
        setNoProfilesAvailable(true);
    };

    const preventDefault = (e: any) => e.preventDefault();

    const profileListingEnabled = serverConfig?.listProfiles ?? false;

    return (
        <AlertDialog open={isOpen}>
            <AlertDialogContent onEscapeKeyDown={preventDefault} className='min-h-[40rem] max-w-[27rem]'>
                <Tabs value={activeTab} onValueChange={setActiveTab} >
                    {showSwitch && (<div className="flex justify-center sm:justify-start">
                        <TabsList>
                            <TabsTrigger value="login">Login</TabsTrigger>
                            <TabsTrigger value="signup">Sign Up</TabsTrigger>
                        </TabsList>
                    </div>)}
                    <AlertDialogHeader className='pt-5 pb-3'>
                        <AlertDialogTitle className='text-2xl font-bold'>
                            <TabsContent value="login">
                                Welcome to HomeCloud 🎉
                            </TabsContent>
                            <TabsContent value="signup">Let's get you started ✨</TabsContent>
                        </AlertDialogTitle>
                        <TabsContent value="login">
                            <AlertDialogDescription>
                                {
                                    profileListingEnabled
                                        ? "Select a profile to login."
                                        : "Login with your credentials."
                                }
                            </AlertDialogDescription>
                        </TabsContent>
                        <TabsContent value="signup">
                            <AlertDialogDescription>
                                Start by creating your Profile.
                            </AlertDialogDescription>
                        </TabsContent>
                        {error && (
                            <div className='text-red-500 m-3'>{error}</div>
                        )}
                    </AlertDialogHeader>
                    <TabsContent value="login">
                        {profileListingEnabled
                            ? (<ProfileSelector onNoProfiles={handleNoProfiles} onLoginSucess={handleLoginSucess} />)
                            : (<LoginForm onLoginSucess={handleLoginSucess} />)}
                    </TabsContent>
                    <TabsContent value="signup">
                        <SignupForm isFirstProfile={noProfilesAvailable} onLoginSucess={handleLoginSucess} />
                    </TabsContent>
                </Tabs>
            </AlertDialogContent>
        </AlertDialog>);
};

export default LoginModal;
