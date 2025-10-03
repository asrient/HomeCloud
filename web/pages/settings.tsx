import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { buildPageConfig, isMacosTheme } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React from 'react'
import { staticConfig } from '@/lib/staticConfig'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'
import { Settings } from "lucide-react";
import { ThemedIconName } from "@/lib/enums";

function Page() {

  return (
    <>
      <Head>
        <title>Settings</title>
      </Head>

      <PageBar icon={ThemedIconName.Settings} title='Settings'>
      </PageBar>
      <PageContent>
        <FormContainer>
          <div className='mt-6 mb-10 flex flex-col items-center justify-center font-light text-foreground/40'>
            <Image src='/icons/icon.png' priority alt='HomeCloud' width={80} height={80} />
            <div className='pt-4 text-lg'>
              HomeCloud Desktop
            </div>
            <div className='text-xs font-semibold'>
              {staticConfig.webVersion}
            </div>
          </div>
          <Section>
            <Line title='Web Version'>
              {staticConfig.webVersion}
            </Line>
            {
              // serverConfig?.version && (
              //   <Line title='Backend Version'>
              //     {serverConfig.version}
              //   </Line>
              // )
            }
            {
              staticConfig.isDev && (
                <Line title='Web Mode'>
                  <div className='text-yellow-500'>Development</div>
                </Line>
              )
            }
            {
              // serverConfig?.isDev && (
              //   <Line title='Backend Mode'>
              //     <div className='text-yellow-500'>Development</div>
              //   </Line>
              // )
            }
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
        </FormContainer>
      </PageContent>
    </>
  )
}

Page.config = buildPageConfig()
export default Page
