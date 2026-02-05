import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { Button } from './ui/button';
import Image from 'next/image';
import Head from 'next/head';
import { cn, isWin11Theme } from '@/lib/utils';

const SplashScreen = () => {
    const { appError } = useAppState();

    return (<>
        <Head>
            <title>
                HomeCloud
            </title>
        </Head>
        <div className={cn('w-full h-full min-h-screen p-4 flex flex-col justify-center items-center app-dragable',
            !isWin11Theme() && 'bg-background')}>
            <div>
                <Image src='/icons/icon.png' priority alt='HomeCloud logo' width={appError ? 90 : 130} height={appError ? 90 : 130} />
            </div>
            {appError &&
                <div className='mt-6 text-foreground flex flex-col justify-center items-center app-nodrag'>
                    <div className='text-xl mb-2 font-medium'>
                        {"I got issues, you got'em too..."}
                    </div>
                    <div className='text-foreground/70 font-mono text-xs'>{appError}</div>
                    <div className='mt-3'>
                        <Button variant='default' onClick={() => window.location.reload()}>Reload</Button>
                    </div>
                </div>}
        </div>
    </>);
};

export default SplashScreen;
