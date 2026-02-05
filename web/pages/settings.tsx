import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { buildPageConfig, getOSIconUrl } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useState, useCallback } from 'react'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ThemedIconName } from "@/lib/enums";
import { DeviceInfo, PeerInfo, PhotoLibraryLocation } from "shared/types";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { useAccountState } from "@/components/hooks/useAccountState";
import { useAppState } from "@/components/hooks/useAppState";
import { getAppName } from '@/lib/utils';
import { Folder, Plus, X } from 'lucide-react';
import { DeviceIcon } from '@/components/DeviceIcon';

function Page() {
  const [deviceInfo, setDeviceInfo] = useState<null | DeviceInfo>(null);
  const [photoLibraries, setPhotoLibraries] = useState<PhotoLibraryLocation[]>([]);
  const [autoStartEnabled, setAutoStartEnabled] = useState<boolean | null>(null);
  const [autoStartDisabled, setAutoStartDisabled] = useState(false);
  const { openDialog } = useOnboardingStore();

  const fetchPhotoLibraries = useCallback(async () => {
    try {
      const locations = await window.modules.getLocalServiceController().photos.getLocations();
      setPhotoLibraries(locations);
    } catch (e) {
      console.error('Failed to fetch photo libraries:', e);
    }
  }, []);

  useEffect(() => {
    const fetchDeviceInfo = async () => {
      const info = await window.modules.getLocalServiceController().system.getDeviceInfo();
      setDeviceInfo(info);
    };
    const fetchAutoStartStatus = async () => {
      const localSc = window.modules.getLocalServiceController();
      // Check if auto-start is supported (returns null if not)
      const enabled = await localSc.app.isAutoStartEnabled();
      if (enabled !== null) {
        setAutoStartEnabled(enabled);
      }
    };
    fetchDeviceInfo();
    fetchPhotoLibraries();
    fetchAutoStartStatus();
  }, [fetchPhotoLibraries]);

  const handleAutoStartToggle = async (checked: boolean) => {
    setAutoStartDisabled(true);
    try {
      const localSc = window.modules.getLocalServiceController();
      await localSc.app.setAutoStart(checked);
      setAutoStartEnabled(checked);
    } catch (e) {
      console.error('Failed to toggle auto-start:', e);
    }
    finally {
      setAutoStartDisabled(false);
    }
  };

  const handleAddPhotoLibrary = async () => {
    try {
      const localSc = window.modules.getLocalServiceController();
      const result = await localSc.files.openFilePicker(false, true, undefined, 'Select Library Folder', 'Select');
      if (result && result.length > 0) {
        const selectedPath = result[0].path;
        const folderName = selectedPath.split(/[/\\]/).pop() || 'Library';
        await localSc.photos.addLocation(folderName, selectedPath);
        await fetchPhotoLibraries();
      }
    } catch (e) {
      console.error('Failed to add photo library:', e);
    }
  };

  const handleRemovePhotoLibrary = async (id: string) => {
    try {
      const localSc = window.modules.getLocalServiceController();
      await localSc.photos.removeLocation(id);
      await fetchPhotoLibraries();
    } catch (e) {
      console.error('Failed to remove photo library:', e);
    }
  };

  const { isLinked, accountEmail } = useAccountState();
  const { peers } = useAppState();

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
          {autoStartEnabled !== null && (
            <Section title="Preferences">
              <Line title={`Start ${getAppName()} at login`}>
                <Switch
                  checked={autoStartEnabled}
                  onCheckedChange={handleAutoStartToggle}
                  disabled={autoStartDisabled}
                />
              </Line>
            </Section>
          )}
          <Section title="Photo Libraries">
            {photoLibraries.map((library) => (
              <Line key={library.id} title={
                <div className="flex items-center">
                  <Folder className="w-8 h-8 mr-3 text-foreground/70" />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{library.name}</span>
                    <span className="text-xs text-foreground/50">{library.location}</span>
                  </div>
                </div>
              }>
                <ConfirmModal
                  title='Remove Photo Library'
                  description={`Are you sure you want to remove "${library.name}" from your photo libraries?`}
                  onConfirm={() => handleRemovePhotoLibrary(library.id)}
                  buttonVariant='destructive'
                  buttonText='Remove'
                >
                  <Button variant='ghost' className='text-red-500' size='icon'>
                    <X className="w-4 h-4" />
                  </Button>
                </ConfirmModal>
              </Line>
            ))}
            <Line>
              <Button variant='ghost' className="text-primary" size='sm' onClick={handleAddPhotoLibrary}>
                <Plus className="w-4 h-4 mr-1" />
                Add Photo Library...
              </Button>
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
          {isLinked && peers.length > 0 && (
            <Section title="Linked Devices">
              {peers.map((peer: PeerInfo) => (
                <Line key={peer.fingerprint} title={
                  <div className="flex items-center">
                    <DeviceIcon
                      iconKey={peer.iconKey}
                      alt={peer.deviceName}
                      size={32}
                      className="mr-3"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{peer.deviceName}</span>
                      <span className="text-xs text-foreground/50">
                        {peer.deviceInfo ? `${peer.deviceInfo.os} ${peer.deviceInfo.osFlavour}` : peer.version}
                      </span>
                    </div>
                  </div>
                }>
                  <ConfirmModal
                    title='Remove Device'
                    description={`Are you sure you want to remove "${peer.deviceName}" from your account?`}
                    onConfirm={async () => {
                      const localSc = window.modules.getLocalServiceController();
                      await localSc.account.removePeer(peer.fingerprint);
                    }}
                    buttonVariant='destructive'
                    buttonText='Remove'
                  >
                    <Button variant='ghost' className='text-red-500' size='icon'>
                      <X className="w-4 h-4" />
                    </Button>
                  </ConfirmModal>
                </Line>
              ))}
            </Section>
          )}
          <div className='mt-6 mb-5 flex items-center justify-center font-base text-foreground/70'>
            <Image src='/icons/icon.png' priority alt='HomeCloud' width={25} height={25} />
            <div className='pl-2 text-sm'>
              {getAppName()}. Asrient's Studio, 2025.
            </div>
          </div>
        </FormContainer>
      </PageContent>
    </>
  )
}

Page.config = buildPageConfig()
export default Page
