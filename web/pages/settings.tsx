import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line } from '@/components/formPrimatives'
import { buildPageConfig, getOSIconUrl, isWindows } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import ConfirmModal from '@/components/confirmModal'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { ThemedIconName, ConnectionType } from "@/lib/enums";
import { PeerInfo, PhotoLibraryLocation } from "shared/types";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { useAccountState } from "@/components/hooks/useAccountState";
import { useAppState } from "@/components/hooks/useAppState";
import { getAppName } from '@/lib/utils';
import { Folder, Plus, X, ExternalLink } from 'lucide-react';
import { DeviceIcon } from '@/components/DeviceIcon';
import { UserPreferences, UpdateInfo, UpdateStatus } from "@/lib/types";

function Page() {
  const [photoLibraries, setPhotoLibraries] = useState<PhotoLibraryLocation[]>([]);
  const [autoStartEnabled, setAutoStartEnabled] = useState<boolean | null>(null);
  const [autoStartDisabled, setAutoStartDisabled] = useState(false);
  const { openDialog } = useOnboardingStore();
  const [useWinrtDgram, setUseWinrtDgram] = useState(false);
  const [autoConnectMobile, setAutoConnectMobile] = useState(true);
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('notavailable');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [ifaceStatuses, setIfaceStatuses] = useState<{ type: ConnectionType; enabled: boolean }[]>([]);

  useEffect(() => {
    const localSc = window.modules.getLocalServiceController();
    setUseWinrtDgram(localSc.app.getUserPreference(UserPreferences.USE_WINRT_DGRAM));
    const autoConnectMobilePref = localSc.app.getUserPreference(UserPreferences.AUTO_CONNECT_MOBILE);
    setAutoConnectMobile(autoConnectMobilePref !== false);
    const updatesPref = localSc.app.getUserPreference(UserPreferences.CHECK_FOR_UPDATES);
    setCheckForUpdates(updatesPref !== false);
    setIfaceStatuses(localSc.net.getConnectionInterfaceStatuses());
    if (window.utils?.getUpdateStatus) {
      setUpdateStatus(window.utils.getUpdateStatus());
    }
  }, []);

  const updateWinrtDgram = useCallback(async (val: boolean) => {
    const localSc = window.modules.getLocalServiceController();
    await localSc.app.setUserPreference(UserPreferences.USE_WINRT_DGRAM, val);
    setUseWinrtDgram(localSc.app.getUserPreference(UserPreferences.USE_WINRT_DGRAM));
  }, []);

  const updateAutoConnectMobile = useCallback(async (val: boolean) => {
    const localSc = window.modules.getLocalServiceController();
    await localSc.app.setUserPreference(UserPreferences.AUTO_CONNECT_MOBILE, val);
    setAutoConnectMobile(val);
  }, []);

  const updateCheckForUpdates = useCallback(async (val: boolean) => {
    const localSc = window.modules.getLocalServiceController();
    await localSc.app.setUserPreference(UserPreferences.CHECK_FOR_UPDATES, val);
    setCheckForUpdates(val);
  }, []);

  const connectionInterfaceLabels: Record<string, string> = {
    [ConnectionType.LOCAL]: 'Local Network',
    [ConnectionType.WEB]: 'Web Connect',
  };

  const handleToggleInterface = useCallback(async (type: ConnectionType, enabled: boolean) => {
    setIfaceStatuses(prev => prev.map(s => s.type === type ? { ...s, enabled } : s));
    const localSc = window.modules.getLocalServiceController();
    await localSc.net.setConnectionInterfaceEnabled(type, enabled);
  }, []);

  const handleCheckForUpdates = useCallback(async () => {
    if (!window.utils?.checkForUpdates) return;
    setCheckingUpdates(true);
    try {
      const info = await window.utils.checkForUpdates(true);
      setUpdateInfo(info);
      setUpdateStatus(info?.updateAvailable ? 'available' : 'notavailable');
    } catch (e) {
      console.error('Failed to check for updates:', e);
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  const fetchPhotoLibraries = useCallback(async () => {
    try {
      const locations = await window.modules.getLocalServiceController().photos.getLocations();
      setPhotoLibraries(locations);
    } catch (e) {
      console.error('Failed to fetch photo libraries:', e);
    }
  }, []);

  useEffect(() => {
    const fetchAutoStartStatus = async () => {
      const localSc = window.modules.getLocalServiceController();
      // Check if auto-start is supported (returns null if not)
      const enabled = await localSc.app.isAutoStartEnabled();
      if (enabled !== null) {
        setAutoStartEnabled(enabled);
      }
    };
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
  const { peers, deviceInfo } = useAppState();

  const showPreferences = useMemo(() => {
    return autoStartEnabled !== null
      || !window.modules.config.IS_STORE_DISTRIBUTION
      || isWindows()
      || isLinked;
  }, [autoStartEnabled, isLinked]);

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
              <div className="flex items-center gap-2">
                {window.modules.config.VERSION}
                {updateStatus === 'available' && updateInfo && (
                  <span className="text-xs text-green-500 font-medium">v{updateInfo.latestVersion} available</span>
                )}
              </div>
            </Line>
            <Line title='Device Info'>
              {deviceInfo && (
                <div className="flex items-center">
                  <Image src={getOSIconUrl(deviceInfo)} alt={deviceInfo.os} width={20} height={20} className="mr-1" />
                  {`${deviceInfo.os} ${deviceInfo.osFlavour} (${deviceInfo.formFactor})`}
                </div>
              )}
            </Line>
            {'checkForUpdates' in (window.utils || {}) && !window.modules.config.IS_STORE_DISTRIBUTION && (
              <Line>
                {updateStatus === 'available' && updateInfo ? (
                  <div className="flex items-center gap-2">
                    <Button variant='ghost' className="text-primary" size='sm' onClick={() => {
                      const localSc = window.modules.getLocalServiceController();
                      localSc.system.openUrl(updateInfo.releaseUrl);
                    }}>
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Download {updateInfo.releaseName}
                    </Button>
                    <Button variant='ghost' size='sm' onClick={handleCheckForUpdates} disabled={checkingUpdates}>
                      Refresh
                    </Button>
                  </div>
                ) : (
                  <Button variant='ghost' className="text-primary" size='sm' onClick={handleCheckForUpdates} disabled={checkingUpdates}>
                    {checkingUpdates ? 'Checking...' : 'Check for updates'}
                  </Button>
                )}
              </Line>
            )}
          </Section>
          {showPreferences && <Section title="Preferences">
              {autoStartEnabled !== null && <Line title={`Start ${getAppName()} at login`}>
                <Switch
                  checked={autoStartEnabled}
                  onCheckedChange={handleAutoStartToggle}
                  disabled={autoStartDisabled}
                />
              </Line>}
              {!window.modules.config.IS_STORE_DISTRIBUTION && <Line title='Check for updates automatically'>
                <Switch
                  checked={checkForUpdates}
                  onCheckedChange={updateCheckForUpdates}
                />
              </Line>}
              {isLinked && <Line title='Auto connect my mobile devices'>
                <Switch
                  checked={autoConnectMobile}
                  onCheckedChange={updateAutoConnectMobile}
                />
              </Line>}
              {
                isWindows() && <Line title={'Use modern network API for Windows (Experimental)'}>
                  <Switch
                    checked={useWinrtDgram}
                    onCheckedChange={updateWinrtDgram}
                  />
                </Line>
              }
            </Section>}
          {ifaceStatuses.length > 0 && (
            <Section title="Allowed Connections" footer="At least one connection method must be enabled to connect to other devices.">
              {ifaceStatuses.map(({ type, enabled }) => (
                <Line key={type} title={connectionInterfaceLabels[type] || type}>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(val) => handleToggleInterface(type, val)}
                  />
                </Line>
              ))}
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
                Add Photo Library
              </Button>
            </Line>
          </Section>
          <Section title="Account">
            {
              !isLinked && <Line>
                <Button variant='ghost' className="text-primary" size={'sm'} onClick={() => {
                  openDialog('login');
                }}>
                  Login to account
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
                    Unlink device
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
