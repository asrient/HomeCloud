import { useAppDispatch, useAppState } from '@/components/hooks/useAppState'
import PageBar from '@/components/pageBar'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { Button } from '@/components/ui/button'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useCallback, useMemo } from 'react'
import ConfirmModal from '@/components/confirmModal'
import { settingsUrl } from '@/lib/urls'
import React from 'react'
import { usePeerState } from '@/components/hooks/usePeerState'
import { getUrlFromIconKey } from '@/lib/utils'

function Page() {
    const router = useRouter();
    const { id: fingerprint } = router.query as { id?: string };
    const peers = usePeerState();
    const peer = useMemo(() => {
        if (!fingerprint) return null;
        return peers.find((p) => p.fingerprint === fingerprint) || null;
    }, [fingerprint, peers]);

    const performDelete = useCallback(async () => {
        const serviceController = window.modules.getLocalServiceController();
        if (!fingerprint || !serviceController) return;
        await serviceController.app.removePeer(fingerprint);
        router.push(settingsUrl());
    }, [router, fingerprint]);

    const performConnect = useCallback(async () => {
        const serviceController = window.modules.getLocalServiceController();
        if (!fingerprint || !serviceController) return;
        try {
            // This will try to connect to the remote device
            await serviceController.net.getRemoteServiceController(fingerprint);
        } catch (e) {
            alert(`Could not connect to "${peer?.deviceName}"`)
            console.error(e);
        }

    }, [fingerprint, peer?.deviceName]);

    if (!peer) {
        return (
            <div className='flex justify-center items-center min-h-[20rem] p-2'>
                Invalid Device.
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Device Settings</title>
            </Head>
            <main>
                <PageBar icon={getUrlFromIconKey(peer.iconKey)} title={peer.deviceName || 'Device'}>
                </PageBar>
                <PageContainer>
                    <div className='mt-6 mb-10 flex justify-center'>
                        <Image src={getUrlFromIconKey(peer.iconKey)} priority alt='device icon' width={80} height={80} />
                    </div>

                    <Section title='About'>
                        <Line title='Name'>{peer.deviceName || 'Unknown Device'}</Line>
                        <Line title='Fingerprint'>{peer.fingerprint}</Line>
                        <Line title='Version'>{peer.version}</Line>
                        <Line title='OS'>{peer.deviceInfo.os}</Line>
                        <Line title='OS Version'>{peer.deviceInfo.osFlavour}</Line>
                        <Line title='Device Type'>{peer.deviceInfo.formFactor}</Line>
                    </Section>

                    <Section title='Connection'>
                        <Line title='Status'>{
                            peer.connection ? 'Connected' : 'Disconnected'
                        }</Line>
                        {
                            !(peer.connection) && (<Line>
                                <Button onClick={performConnect} variant='ghost' className='text-blue-500' size='sm'>
                                    Connect...
                                </Button>
                            </Line>)}
                        {
                            peer.connection && (
                                <Line title='Link type'>{peer.connection.connectionType}</Line>
                            )
                        }
                    </Section>

                    <Section>
                        <Line>
                            <ConfirmModal
                                title={`Remove "${peer.deviceName}"?`}
                                onConfirm={performDelete}
                                buttonVariant='destructive'
                            >
                                <Button variant='ghost' className='text-red-500' size='sm'>
                                    Remove Device
                                </Button>
                            </ConfirmModal>
                        </Line>
                    </Section>
                </PageContainer>
            </main>
        </>
    )
}

Page.config = buildPageConfig(SidebarType.Settings)
export default Page
