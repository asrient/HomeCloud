import { useAppDispatch, useAppState } from '@/components/hooks/useAppState'
import PageBar from '@/components/pageBar'
import ProfilePicture from '@/components/profilePicture'
import { PageContainer, Section, Line, LineLink } from '@/components/settingsView'
import TextModal from '@/components/textModal'
import { Button } from '@/components/ui/button'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import { DialogTrigger } from '@/components/ui/dialog'
import Head from 'next/head'
import { updateProfile, updateProfileProtected } from '@/lib/api/profile'
import { logout } from '@/lib/api/auth'
import { useCallback } from 'react'
import { ActionTypes } from '@/lib/state'
import ConfirmModal from '@/components/confirmModal'
import TextModalProtected from '@/components/textModalProtected'

function Page() {
  const { profile, serverConfig } = useAppState();
  const dispatch = useAppDispatch();

  const performUpdateName = useCallback(async (name: string) => {
    if (!profile) return;
    const { profile: profile_ } = await updateProfile({
      name,
    });
    dispatch(ActionTypes.UPDATE_PROFILE, { profile: profile_ })
  }, [dispatch, profile]);

  const performLogout = useCallback(async () => {
    await logout();
    window.location.href = '/';
  }, []);

  const performPasswordUpdate = useCallback(async (newPassword: string, oldPassword: string) => {
    if (!profile) return;
    const { profile: profile_ } = await updateProfileProtected({
      newPassword,
      password: oldPassword,
    });
    dispatch(ActionTypes.UPDATE_PROFILE, { profile: profile_ })
  }, [dispatch, profile]);

  const performUsernameUpdate = useCallback(async (username: string, password: string) => {
    if (!profile) return;
    const { profile: profile_ } = await updateProfileProtected({
      password,
      username,
    });
    dispatch(ActionTypes.UPDATE_PROFILE, { profile: profile_ })
  }, [dispatch, profile]);

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
                  <TextModal
                    title='Profile Name'
                    description='Update your profile name.'
                    defaultValue={profile.name}
                    fieldName='Name'
                    onDone={performUpdateName}
                    buttonText='Save'
                    noTrigger
                  >
                    <DialogTrigger>
                      <LineLink text={profile.name} />
                    </DialogTrigger>
                  </TextModal>
                </Line>
              </Section>
              <Section>
                {serverConfig?.requireUsername && <Line title='Username'>

                  <TextModalProtected
                    title='Update Username'
                    description='No spaces or special characters allowed.'
                    onDone={performUsernameUpdate}
                    buttonText='Save'
                    textType='text'
                    fieldName='New Username'
                    noTrigger>
                    <DialogTrigger>
                      <LineLink text={profile.username} />
                    </DialogTrigger>
                  </TextModalProtected>
                </Line>}
                <Line title='Password'>
                  <TextModalProtected
                    title={
                      profile.isPasswordProtected ?
                        'Update Password'
                        : 'Set Password'
                    }
                    description='Password must be at least 6 characters long.'
                    onDone={performPasswordUpdate}
                    buttonText='Save'
                    textType='password'
                    fieldName='New Password'
                    noTrigger>
                    <DialogTrigger>
                      <LineLink text={
                        profile.isPasswordProtected ?
                          'Change'
                          : 'Set password'
                      } color='blue' />
                    </DialogTrigger>
                  </TextModalProtected>
                </Line>
              </Section>
              <Section>
                <Line>
                  <ConfirmModal
                    title='Logout'
                    description='Are you sure you want to logout from this device?'
                    onConfirm={performLogout}
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
          )
        }
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Settings)
export default Page
