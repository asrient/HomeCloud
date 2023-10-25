import { useAppState } from '@/components/hooks/useAppState'
import PageBar from '@/components/pageBar'
import ProfilePicture from '@/components/profilePicture'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { Button } from '@/components/ui/button'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import Head from 'next/head'


function Page() {
  const { profile, serverConfig } = useAppState();

  return (
    <>
      <Head>
        <title>Profile - Settings</title>
      </Head>
      <main>
        <PageBar icon='/icons/user.png' title='Profile'>
        </PageBar>
        {
          profile && (
            <PageContainer>
              <Section>
                <Line title='Picture'>
                  <ProfilePicture profile={profile} size='sm' />
                </Line>
                <Line title='Name'>
                  {profile?.name}
                </Line>
              </Section>
              <Section>
                {serverConfig?.requireUsername && <Line title='Username'>
                  {profile?.username}
                </Line>}
                <Line title='Password'>
                  <Button variant='ghost' className='text-blue-500' size='sm'>
                    {
                      profile.isPasswordProtected ?
                        'Change'
                        : 'Set password'
                    }
                  </Button>
                </Line>
              </Section>
              <Section>
                <Line>
                  <Button variant='ghost' className='text-red-500' size='sm'>
                    Logout..
                  </Button>
                </Line>
              </Section>
            </PageContainer>
          )
        }
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Settings)
export default Page
