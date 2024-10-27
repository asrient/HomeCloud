import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { initalialState, pollSession, requestSession } from '@/lib/api/auth';
import { Button } from './ui/button';

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
    const { serverConfig, profile, isInitalized, appError } = useAppState();
    const dispatch = useAppDispatch();
    const [isWaitingForConsent, setIsWaitingForConsent] = useState(false);

    const handleSessionCreated = useCallback(async () => {
        setIsWaitingForConsent(false);
        try {
            const data = await initalialState();
            if (!data.profile) {
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
            const { status, profile } = await pollSession({ fingerprint: serverConfig.fingerprint, token });
            console.log("Polling session status", status, profile);
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
        if (profile) return;
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
    }, [profile, isInitalized, serverConfig, appError, dispatch, checkStatus]);

    return (<div>
        <div>
            HomeCloud
        </div>
        {
            appError ? (<div>
                <div>
                    Something went wrong...
                </div>
                <div>{appError}</div>
                <div>
                    <Button onClick={() => window.location.reload()}>Reload</Button>
                </div>
            </div>) :
                isWaitingForConsent ? (<div>
                    Click on "Allow" on the popup to continue.
                </div>) :
                    <div>
                        Setting things up..
                    </div>
        }
    </div>);
};

export default SplashScreen;
