import React, { useEffect, useState, useCallback } from 'react';
import { Section, Line, LineLink } from '@/components/formPrimatives';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { McpServerInfo, AgentConfig } from "shared/types";
import { getServiceController } from '@/lib/utils';

interface AISettingsSectionProps {
  fingerprint: string | null;
}

export default function AISettingsSection({ fingerprint }: AISettingsSectionProps) {
  const [mcpInfo, setMcpInfo] = useState<McpServerInfo | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [agentConfig, setAgentConfigState] = useState<AgentConfig | null>(null);
  const [agentPresets, setAgentPresets] = useState<AgentConfig[]>([]);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [agentForm, setAgentForm] = useState<{ name: string; command: string; args: string; addWorkflowMcp: boolean }>({ name: '', command: '', args: '', addWorkflowMcp: false });
  const [agentSaving, setAgentSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    getServiceController(fingerprint).then(async (sc) => {
      if (cancelled) return;
      await Promise.all([
        sc.workflow.getMcpServerInfo().then(setMcpInfo).catch(console.error),
        sc.agent.getAgentConfig().then(setAgentConfigState).catch(console.error),
        sc.agent.getAgentConfigPresets().then(setAgentPresets).catch(console.error),
      ]);
      if (!cancelled) setLoading(false);
    }).catch((e) => {
      console.error(e);
      if (!cancelled) { setError(true); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [fingerprint]);

  const refreshMcpInfo = useCallback(async () => {
    const sc = await getServiceController(fingerprint);
    const info = await sc.workflow.getMcpServerInfo();
    setMcpInfo(info);
    return info;
  }, [fingerprint]);

  const handleMcpToggle = useCallback(async (start: boolean) => {
    setMcpLoading(true);
    try {
      const sc = await getServiceController(fingerprint);
      if (start) {
        await sc.workflow.startMcpServer();
      } else {
        await sc.workflow.stopMcpServer();
      }
      await refreshMcpInfo();
    } catch (e) {
      console.error('Failed to toggle MCP server:', e);
    } finally {
      setMcpLoading(false);
    }
  }, [fingerprint, refreshMcpInfo]);

  const handleSetAgent = useCallback(async (config: AgentConfig) => {
    try {
      const sc = await getServiceController(fingerprint);
      await sc.agent.setAgentConfig(config);
      setAgentConfigState(config);
    } catch (e) {
      console.error('Failed to set agent config:', e);
    }
  }, [fingerprint]);

  const handleRemoveAgent = useCallback(async () => {
    try {
      const sc = await getServiceController(fingerprint);
      await sc.agent.removeAgentConfig();
      setAgentConfigState(null);
    } catch (e) {
      console.error('Failed to remove agent config:', e);
    }
  }, [fingerprint]);

  const handleSaveAgent = useCallback(async () => {
    if (!agentForm.name || !agentForm.command || agentSaving) return;
    const config: AgentConfig = {
      name: agentForm.name,
      command: agentForm.command,
      args: agentForm.args.split(/\s+/).filter(Boolean),
      addWorkflowMcp: agentForm.addWorkflowMcp,
    };
    setAgentSaving(true);
    try {
      await handleSetAgent(config);
      setAgentModalOpen(false);
    } finally {
      setAgentSaving(false);
    }
  }, [agentForm, agentSaving, handleSetAgent]);

  const handleRemoveAgentFromModal = useCallback(async () => {
    if (agentSaving) return;
    setAgentSaving(true);
    try {
      await handleRemoveAgent();
      setAgentModalOpen(false);
    } finally {
      setAgentSaving(false);
    }
  }, [agentSaving, handleRemoveAgent]);

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

  return (
    <fieldset disabled={loading || error} className="m-0 p-0 border-0">
    <Section title="Artificial Intelligence" footer="Allow AI agents access your devices via the Model Context Protocol.">
      <Dialog open={agentModalOpen} onOpenChange={setAgentModalOpen}>
        <Line title="AI Agent">
          <LineLink onClick={openAgentModal} text={loading ? '...' : (agentConfig ? agentConfig.name : 'Setup')} type={agentConfig ? 'default' : 'primary'} />
        </Line>
        <DialogContent className="sm:max-w-[26rem]" onPointerDownOutside={(e) => e.preventDefault()}>
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
                <Button variant="ghost" className="text-red-500" size="sm" onClick={handleRemoveAgentFromModal} disabled={agentSaving}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setAgentModalOpen(false)} disabled={agentSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveAgent} disabled={!agentForm.name || !agentForm.command || agentSaving}>
                {agentSaving ? 'Saving…' : 'Save'}
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
    </fieldset>
  );
}
