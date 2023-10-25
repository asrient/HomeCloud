import PageBar from '@/components/pageBar'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React from 'react'
import { staticConfig, isDesktop } from '@/lib/staticConfig'
import { useAppState } from '@/components/hooks/useAppState'

function Page() {
  const { isAppLoaded } = useAppState();

  return (
    <>
      <Head>
        <title>General - Settings</title>
      </Head>
      <main>
        <PageBar icon='/icons/settings.png' title='General'>
        </PageBar>

        {isAppLoaded && (<PageContainer>
          <div className='mt-6 mb-10 flex flex-col items-center justify-center font-light text-foreground/40'>
            <Image src='/icons/icon.png' priority alt='HomeCloud' width={80} height={80} />
            <div className='pt-4 text-lg'>
              {`HomeCloud ${isDesktop() ? 'Desktop' : 'Server'}`}
            </div>
            <div className='text-xs font-semibold'>
              {staticConfig.webVersion}
            </div>
          </div>
          <Section>
            <Line title='Version'>
              {staticConfig.webVersion}
            </Line>
            <Line title='Platform'>
              {staticConfig.envType}
            </Line>
            {
              staticConfig.isDev && (
                <Line title='Development Mode'>
                  <div className='text-yellow-500'>Enabled</div>
                </Line>
              )
            }
          </Section>
        </PageContainer>)}
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Settings)
export default Page
