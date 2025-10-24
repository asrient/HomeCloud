import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { buildPageConfig, getOSIconUrl } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useState } from 'react'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'
import { ThemedIconName } from "@/lib/enums";
import { DeviceInfo } from "shared/types";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { useAccountState } from "@/components/hooks/useAccountState";

function Page() {

  const [deviceInfo, setDeviceInfo] = useState<null | DeviceInfo>(null);
  const { openDialog } = useOnboardingStore();

  useEffect(() => {
    const fetchDeviceInfo = async () => {
      const info = await window.modules.getLocalServiceController().system.getDeviceInfo();
      setDeviceInfo(info);
    };
    fetchDeviceInfo();
  }, []);

  const { isLinked, accountEmail } = useAccountState();

  return (
    <>
      <Head>
        <title>Settings</title>
      </Head>

      <PageBar icon={ThemedIconName.Settings} title='Settings'>
      </PageBar>
      <PageContent>
        <FormContainer>
          <Section title="About">
            <Line title='Version'>
              {window.modules.config.VERSION}
            </Line>
            <Line title='Device Info'>
              {deviceInfo && (
                <div className="flex items-center">
                  <Image src={getOSIconUrl(deviceInfo)} alt={deviceInfo.os} width={20} height={20} className="mr-1" />
                  {`${deviceInfo.os} ${deviceInfo.osFlavour} (${deviceInfo.formFactor})`}
                </div>
              )}
            </Line>
          </Section>
          <Section title="Account">
            {
              !isLinked && <Line>
                <Button variant='ghost' className="text-primary" size={'sm'} onClick={() => {
                  openDialog('login');
                }}>
                  Login to account...
                </Button>
              </Line>
            }
            {
              isLinked && <Line title='Email'>
                {accountEmail}
              </Line>
            }
            {
            isLinked && <Line>
              <ConfirmModal
                title='Unlink Device'
                description='Are you sure you want to unlink this device from your account?'
                onConfirm={async () => {
                  const localSc = window.modules.getLocalServiceController();
                  await localSc.account.removePeer(null);
                }}
                buttonVariant='destructive'
                buttonText='Confirm'
              >
                <Button variant='ghost' className='text-red-500' size='sm'>
                  Unlink device...
                </Button>
              </ConfirmModal>
            </Line>
            }
          </Section>
          <div className='mt-6 mb-5 flex items-center justify-center font-base text-foreground/70'>
            <Image src='/icons/icon.png' priority alt='HomeCloud' width={25} height={25} />
            <div className='pl-2 text-sm'>
              Media Center. Asrient's Studio, 2025.
            </div>
          </div>
        </FormContainer>
      </PageContent>
    </>
  )
}

Page.config = buildPageConfig()
export default Page
