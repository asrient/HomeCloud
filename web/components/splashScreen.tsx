import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { initalialState, pollSession, requestSession } from '@/lib/api/auth';
import { Button } from './ui/button';
import Image from 'next/image';
import Head from 'next/head';

const EXPIRY = 8000;

async function getSessionTokenCached(fingerprint: string) {
    let token = sessionStorage.getItem(`sessionRequest-${fingerprint}-token`);
    let expiry = sessionStorage.getItem(`sessionRequest-${fingerprint}-expiry`);
    if (token && expiry && Date.now() < parseInt(expiry, 10)) {
        return token;
    }
    ({ token } = await requestSession({ fingerprint }));
    sessionStorage.setItem(`sessionRequest-${fingerprint}-token`, token);
    sessionStorage.setItem(`sessionRequest-${fingerprint}-expiry`, (Date.now() + EXPIRY).toString());
    return token;
}

function removeSessionTokenFromCache(fingerprint: string, token: string) {
    if (sessionStorage.getItem(`sessionRequest-${fingerprint}-token`) !== token) {
        return;
    }
    sessionStorage.removeItem(`sessionRequest-${fingerprint}-token`);
    sessionStorage.removeItem(`sessionRequest-${fingerprint}-expiry`);
}

const SplashScreen = () => {
    const { serverConfig, isInitalized, appError, isAuthenticated } = useAppState();
    const dispatch = useAppDispatch();
    const [isWaitingForConsent, setIsWaitingForConsent] = useState(false);

    const handleSessionCreated = useCallback(async () => {
        setIsWaitingForConsent(false);
        try {
            const data = await initalialState();
            if (!data.isAuthenticated) {
                throw new Error("Session is not authenticated.");
            }
            dispatch(ActionTypes.INITIALIZE, data);
        } catch (error: any) {
            console.error(error);
            dispatch(ActionTypes.ERROR, error.message);
        }
    }, [dispatch]);

    const checkStatus = useCallback(async (token: string) => {
        if (!serverConfig?.fingerprint) return;
        if (appError) return;
        try {
            const { status } = await pollSession({ fingerprint: serverConfig.fingerprint, token });
            console.log("Polling session status", status);
            if (status) {
                removeSessionTokenFromCache(serverConfig.fingerprint, token);
                handleSessionCreated();
            } else {
                window.setTimeout(() => checkStatus(token), 2000);
            }
        } catch (error: any) {
            console.error(error);
            dispatch(ActionTypes.ERROR, error.message);
        }
    }, [appError, dispatch, handleSessionCreated, serverConfig]);

    useEffect(() => {
        if (!serverConfig?.fingerprint) return;
        if (!isInitalized) return;
        if (appError) return;
        if (isAuthenticated) return;
        async function fetchToken() {
            console.log("Fetching token..");
            setIsWaitingForConsent(false);
            try {
                const token = await getSessionTokenCached(serverConfig!.fingerprint);
                setIsWaitingForConsent(true);
                checkStatus(token);
            } catch (error: any) {
                console.error(error);
                dispatch(ActionTypes.ERROR, error.message);
            }
        }
        fetchToken();
    }, [isInitalized, serverConfig, appError, dispatch, checkStatus, isAuthenticated]);

    return (<>
        <Head>
            <title>
                HomeCloud
            </title>
        </Head>
        <div className='w-full h-full min-h-screen bg-slate-100 p-4 flex flex-col justify-center items-center'>
            <div>
                <Image src='/icons/icon.png' priority alt='HomeCloud logo' width={appError ? 90 : 180} height={appError ? 90 : 180} />
            </div>
            <div className='mt-10 text-gray-500'>
                {
                    appError ? (<div className='flex flex-col justify-center items-center'>
                        <div className='text-xl mb-2 text-gray-700 font-medium'>
                            {"Something went wrong :("}
                        </div>
                        <div className='text-slate-400 font-mono text-xs'>{appError}</div>
                        <div className='mt-3'>
                            <Button size='lg' variant='default' onClick={() => window.location.reload()}>Reload page</Button>
                        </div>
                    </div>) :
                        isWaitingForConsent && (<div>
                            Click "Allow" on the popup to continue.
                        </div>)
                }
            </div>

        </div>
    </>);
};

export default SplashScreen;
