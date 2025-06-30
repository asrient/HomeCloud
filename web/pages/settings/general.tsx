import PageBar from '@/components/pageBar'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React from 'react'
import { staticConfig } from '@/lib/staticConfig'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'

function Page() {

  return (
    <>
      <Head>
        <title>General - Settings</title>
      </Head>
      <main>
        <PageBar icon='/icons/settings.png' title='General'>
        </PageBar>

        <PageContainer>
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
                    onConfirm={async () => {}}
                    buttonVariant='destructive'
                    buttonText='Logout'
                  >
                    <Button variant='ghost' className='text-red-500' size='sm'>
                      Logout..
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
