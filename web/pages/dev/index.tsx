import Head from 'next/head'
import { buildPageConfig, DEV_OverrideUITheme, getUITheme, UI_THEMES } from '@/lib/utils'
import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { useEffect, useMemo, useState } from 'react'
import { staticConfig } from '@/lib/staticConfig'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ThemedIconName } from '@/lib/enums';

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

  const uiTheme = useMemo(() => {
    return getUITheme();
  }, []);

  return (
    <>
      <Head>
        <title>Dev Info</title>
      </Head>

      <PageBar icon={ThemedIconName.Tool} title='Configuration'>
      </PageBar>
      <PageContent>
        <FormContainer>
          <Section title='Debug Settings'>
            <Line title='Current Theme'>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size='sm'>
                    {uiTheme}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  {
                    UI_THEMES.map(theme => (
                      <DropdownMenuCheckboxItem
                        key={theme}
                        checked={uiTheme === theme}
                        onSelect={() => {
                          DEV_OverrideUITheme(theme);
                        }}
                      >
                        {theme}
                      </DropdownMenuCheckboxItem>
                    ))}
                  <DropdownMenuItem
                    onSelect={() => {
                      DEV_OverrideUITheme(null);
                    }}
                  >
                    Reset...
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Line>
          </Section>
          <Section title='App Config'>
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
        </FormContainer>
      </PageContent>
    </>
  )
}

Page.config = buildPageConfig()

export default Page
