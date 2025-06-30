import Head from 'next/head'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PageBar from '@/components/pageBar'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { useEffect, useState } from 'react'
import { staticConfig } from '@/lib/staticConfig'

function convertToString(value: any): string {
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2); // Convert object to a formatted JSON string
  }
  return String(value); // Convert other types to string
}

function Page() {
  const [configList, setConfigList] = useState<any[]>([]);
  const [staticConfigList, setStaticConfigList] = useState<any[]>([]);

  useEffect(() => {
    const configObj = window.modules.config;
    // convert to list
    const list = Object.keys(configObj).map(key => ({
      key,
      value: convertToString(configObj[key as keyof typeof configObj])
    }));
    setConfigList(list);
  }, []);

  useEffect(() => {
    if (staticConfig) {
      const staticList = Object.keys(staticConfig).map(key => ({
        key,
        value: convertToString(staticConfig[key as keyof typeof staticConfig])
      }));
      setStaticConfigList(staticList);
    }
  }, []);

  return (
    <>
      <Head>
        <title>Dev Info</title>
      </Head>
      <main>
        <PageBar icon='/icons/computer.png' title='Dev Information'>
        </PageBar>

        <PageContainer>
          <Section>
            {
              configList.map((item, index) => (
                <Line key={index} title={item.key}>
                  {item.value}
                </Line>
              ))
            }
          </Section>
          <Section title='Web Config'>
            {
                staticConfigList.map((item, index) => (
                  <Line key={index} title={item.key}>
                    {item.value}
                  </Line>
                ))
              }
          </Section>
        </PageContainer>
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Dev)

export default Page
