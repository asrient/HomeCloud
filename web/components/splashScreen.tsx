import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppState } from './hooks/useAppState';
import { ActionTypes } from '@/lib/state';
import { Button } from './ui/button';
import Image from 'next/image';
import Head from 'next/head';

const SplashScreen = () => {
    const { appError } = useAppState();

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
                        <div className='text-xl mb-2 text-gray-700 font-medium'>
                            Just a moment.
                        </div>
                }
            </div>

        </div>
    </>);
};

export default SplashScreen;
