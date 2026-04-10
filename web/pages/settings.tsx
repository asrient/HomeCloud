import { PageBar, PageContent } from "@/components/pagePrimatives";
import { FormContainer, Section, Line, LineLink } from '@/components/formPrimatives'
import { buildPageConfig, getOSIconUrl, isWindows, cn } from '@/lib/utils'
import Head from 'next/head'
import Image from 'next/image'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import ConfirmModal from '@/components/confirmModal'
import TextModal from '@/components/textModal'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ThemedIconName, ConnectionType } from "@/lib/enums";
import { PeerInfo, PhotoLibraryLocation, McpServerInfo, AgentConfig, AgentStatus } from "shared/types";
import { useOnboardingStore } from "@/components/hooks/useOnboardingStore";
import { useAccountState } from "@/components/hooks/useAccountState";
import { useAppState } from "@/components/hooks/useAppState";
import { getAppName } from '@/lib/utils';
import { Folder, Plus, X, MoreHorizontal, ExternalLink, Trash2 } from 'lucide-react';
import { DeviceIcon } from '@/components/DeviceIcon';
import { UserPreferences } from "@/lib/types";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useNavigation } from '@/components/hooks/useNavigation';

function Page() {
  const [photoLibraries, setPhotoLibraries] = useState<PhotoLibraryLocation[]>([]);
  const [autoStartEnabled, setAutoStartEnabled] = useState<boolean | null>(null);
  const [autoStartDisabled, setAutoStartDisabled] = useState(false);
  const { openDialog } = useOnboardingStore();
  const [useWinrtDgram, setUseWinrtDgram] = useState(false);
  const [autoConnectMobile, setAutoConnectMobile] = useState(true);
  const [checkForUpdates, setCheckForUpdates] = useState(true);
  const [ifaceStatuses, setIfaceStatuses] = useState<{ type: ConnectionType; enabled: boolean }[]>([]);
  const [mcpInfo, setMcpInfo] = useState<McpServerInfo | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [agentConfig, setAgentConfigState] = useState<AgentConfig | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [agentPresets, setAgentPresets] = useState<AgentConfig[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState<{ name: string; command: string; args: string; addWorkflowMcp: boolean }>({ name: '', command: '', args: '', addWorkflowMcp: false });

  useEffect(() => {
    const localSc = window.modules.getLocalServiceController();
    setUseWinrtDgram(localSc.app.getUserPreference(UserPreferences.USE_WINRT_DGRAM));
    const autoConnectMobilePref = localSc.app.getUserPreference(UserPreferences.AUTO_CONNECT_MOBILE);
    setAutoConnectMobile(autoConnectMobilePref !== false);
    const updatesPref = localSc.app.getUserPreference(UserPreferences.CHECK_FOR_UPDATES);
    setCheckForUpdates(updatesPref !== false);
    setIfaceStatuses(localSc.net.getConnectionInterfaceStatuses());
    // MCP
    localSc.workflow.getMcpServerInfo().then(setMcpInfo).catch(() => { });
    // Agent
    localSc.agent.getAgentConfig().then(setAgentConfigState).catch(() => { });
    localSc.agent.getStatus().then(setAgentStatus).catch(() => { });
    localSc.agent.getAgentConfigPresets().then(setAgentPresets).catch(() => { });
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

  const refreshMcpInfo = useCallback(async () => {
    const localSc = window.modules.getLocalServiceController();
    const info = await localSc.workflow.getMcpServerInfo();
    setMcpInfo(info);
    return info;
  }, []);

  const handleMcpToggle = useCallback(async (start: boolean) => {
    setMcpLoading(true);
    try {
      const localSc = window.modules.getLocalServiceController();
      if (start) {
        await localSc.workflow.startMcpServer();
      } else {
        await localSc.workflow.stopMcpServer();
      }
      await refreshMcpInfo();
    } catch (e) {
      console.error('Failed to toggle MCP server:', e);
    } finally {
      setMcpLoading(false);
    }
  }, [refreshMcpInfo]);

  const handleSetAgent = useCallback(async (config: AgentConfig) => {
    try {
      const localSc = window.modules.getLocalServiceController();
      await localSc.agent.setAgentConfig(config);
      setAgentConfigState(config);
      const status = await localSc.agent.getStatus();
      setAgentStatus(status);
    } catch (e) {
      console.error('Failed to set agent config:', e);
    }
  }, []);

  const handleRemoveAgent = useCallback(async () => {
    try {
      const localSc = window.modules.getLocalServiceController();
      await localSc.agent.removeAgentConfig();
      setAgentConfigState(null);
      const status = await localSc.agent.getStatus();
      setAgentStatus(status);
    } catch (e) {
      console.error('Failed to remove agent config:', e);
    }
  }, []);

  const handleSaveAgent = useCallback(async () => {
    if (!agentForm.name || !agentForm.command) return;
    const config: AgentConfig = {
      name: agentForm.name,
      command: agentForm.command,
      args: agentForm.args.split(/\s+/).filter(Boolean),
      addWorkflowMcp: agentForm.addWorkflowMcp,
    };
    await handleSetAgent(config);
    setAgentModalOpen(false);
  }, [agentForm, handleSetAgent]);

  const handleRemoveAgentFromModal = useCallback(async () => {
    await handleRemoveAgent();
    setAgentModalOpen(false);
  }, [handleRemoveAgent]);

  const openAgentModal = useCallback(() => {
    if (agentConfig) {
      setAgentForm({
        name: agentConfig.name,
        command: agentConfig.command,
        args: agentConfig.args.join(' '),
        addWorkflowMcp: agentConfig.addWorkflowMcp ?? false,
      });
    } else {
      setAgentForm({ name: '', command: '', args: '', addWorkflowMcp: false });
    }
    setAgentModalOpen(true);
  }, [agentConfig]);

  const applyPreset = useCallback((preset: AgentConfig) => {
    setAgentForm({
      name: preset.name,
      command: preset.command,
      args: preset.args.join(' '),
      addWorkflowMcp: agentForm.addWorkflowMcp,
    });
  }, [agentForm.addWorkflowMcp]);

  const connectionInterfaceLabels: Record<string, string> = {
    [ConnectionType.LOCAL]: 'Local Network',
    [ConnectionType.WEB]: 'Web Connect',
  };

  const handleToggleInterface = useCallback(async (type: ConnectionType, enabled: boolean) => {
    setIfaceStatuses(prev => prev.map(s => s.type === type ? { ...s, enabled } : s));
    const localSc = window.modules.getLocalServiceController();
    await localSc.net.setConnectionInterfaceEnabled(type, enabled);
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
        const rawName = selectedPath.split(/[/\\]/).filter(Boolean).pop() || 'Library';
        let folderName: string;
        try { folderName = decodeURIComponent(rawName); } catch { folderName = rawName; }
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
  const { openDevicePage } = useNavigation();

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
              {window.modules.config.VERSION}
            </Line>
            <Line title='Device Info'>
              {deviceInfo && (
                <div className="flex items-center">
                  {`${deviceInfo.os} ${deviceInfo.osFlavour} - ${deviceInfo.formFactor}`}
                </div>
              )}
            </Line>
            <Line>
              <Button variant='ghost' className="text-primary" size='sm' onClick={() => {
                window.modules.getLocalServiceController().app.exportLogs().catch((err: any) => {
                  console.error('Failed to open log directory:', err);
                });
              }}>
                Export logs for help...
              </Button>
            </Line>
            {'triggerUpdateCheck' in (window.utils || {}) && !window.modules.config.IS_STORE_DISTRIBUTION && (
              <Line>
                <Button variant='ghost' className="text-primary" size='sm' onClick={() => window.utils.triggerUpdateCheck()}>
                  Check for updates...
                </Button>
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
          <Section title="Artificial Intelligence" footer="Allow any AI agent access your devices via the Model Context Protocol.">
            <Dialog open={agentModalOpen} onOpenChange={setAgentModalOpen}>
              <Line title="AI Agent">
                <DialogTrigger>
                  <LineLink text={agentConfig ? agentConfig.name : 'Setup'} color={agentConfig ? 'default' : 'blue'} />
                </DialogTrigger>
              </Line>
              <DialogContent className="sm:max-w-[26rem]">
                <DialogHeader>
                  <DialogTitle>Setup AI Agent</DialogTitle>
                  <DialogDescription>
                    Add a ACP compatible AI Agent to HomeCloud.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-wrap gap-1.5 my-1">
                  {agentPresets.map((preset) => (
                    <Button
                      key={preset.name}
                      variant={agentForm.name === preset.name ? 'default' : 'outline'}
                      size="sm"
                      className="rounded-full text-xs h-7"
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Name</label>
                    <Input
                      placeholder="e.g. GitHub Copilot"
                      value={agentForm.name}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Command</label>
                    <Input
                      placeholder="e.g. copilot"
                      value={agentForm.command}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, command: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Arguments</label>
                    <Input
                      placeholder="e.g. --acp"
                      value={agentForm.args}
                      onChange={(e) => setAgentForm(prev => ({ ...prev, args: e.target.value }))}
                    />
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm">Provide workflow tools</span>
                    <Switch
                      checked={agentForm.addWorkflowMcp}
                      onCheckedChange={(val) => setAgentForm(prev => ({ ...prev, addWorkflowMcp: val }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div>
                    {agentConfig && (
                      <Button variant="ghost" className="text-red-500" size="sm" onClick={handleRemoveAgentFromModal}>
                        Delete
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setAgentModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveAgent} disabled={!agentForm.name || !agentForm.command}>
                      Save
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Line title='Allow access to HomeCloud'>
              <div className="flex items-center gap-2">
                {mcpInfo?.isRunning && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {mcpInfo.url}
                  </span>
                )}
                <Switch
                  checked={mcpInfo?.isRunning ?? false}
                  onCheckedChange={handleMcpToggle}
                  disabled={mcpLoading}
                />
              </div>
            </Line>
          </Section>
          <Section title="Photo Libraries">
            {photoLibraries.map((library) => (
              <Line key={library.id} title={
                <div className="flex items-center">
                  <Folder className="w-7 h-7 mr-2 text-foreground/70" />
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon'>
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem onClick={() => openDevicePage(peer.fingerprint)}>
                        Open device
                      </DropdownMenuItem>
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
                        <DropdownMenuItem className='text-red-500' onSelect={(e) => e.preventDefault()}>
                          Remove
                        </DropdownMenuItem>
                      </ConfirmModal>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Line>
              ))}
            </Section>
          )}
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
          {isLinked && (
            <Section footer="This will permanently delete your account and remove all linked devices.">
              <Line>
                <TextModal
                  title='Delete Account'
                  description='Type DELETE to confirm.'
                  placeholder='DELETE'
                  buttonText='Delete Account'
                  buttonVariant='destructive'
                  validateText={(text) => text === 'DELETE'}
                  onDone={async () => {
                    const localSc = window.modules.getLocalServiceController();
                    await localSc.account.deleteAccount();
                  }}
                >
                  <Button variant='ghost' className='text-red-500' size='sm'>
                    Delete account...
                  </Button>
                </TextModal>
              </Line>
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
