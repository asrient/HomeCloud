import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { buildPageConfig, getOSIconUrl, isMacosTheme } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useMemo, useState } from 'react'
import { staticConfig } from '@/lib/staticConfig'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'
import { Settings } from "lucide-react";
import { ThemedIconName } from "@/lib/enums";
import { DeviceInfo } from "shared/types";

function Page() {

  const [deviceInfo, setDeviceInfo] = useState<null | DeviceInfo>(null);

  useEffect(() => {
    const fetchDeviceInfo = async () => {
      const info = await window.modules.getLocalServiceController().system.getDeviceInfo();
      setDeviceInfo(info);
    };
    fetchDeviceInfo();
  }, []);

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
          <Section>
            <Line>
              <ConfirmModal
                title='Logout'
                description='Are you sure you want to logout from this browser?'
                onConfirm={async () => { }}
                buttonVariant='destructive'
                buttonText='Logout'
              >
                <Button variant='ghost' className='text-red-500' size='sm'>
                  Logout..
                </Button>
              </ConfirmModal>
            </Line>
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
