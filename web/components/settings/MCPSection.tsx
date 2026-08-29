import React, { useCallback, useState } from 'react';
import { Section, Line } from '@/components/formPrimatives';
import { Switch } from '@/components/ui/switch';
import { useMcpServer } from '@/components/hooks/useWorkflows';

interface MCPSettingsSectionProps {
  fingerprint: string | null;
}

export default function MCPSettingsSection({ fingerprint }: MCPSettingsSectionProps) {
  const { info, isLoading, error, startServer, stopServer } = useMcpServer(fingerprint);
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = useCallback(async (start: boolean) => {
    setIsToggling(true);
    try {
      if (start) {
        await startServer();
      } else {
        await stopServer();
      }
    } catch (toggleError) {
      console.error('Failed to toggle MCP server:', toggleError);
    } finally {
      setIsToggling(false);
    }
  }, [startServer, stopServer]);

  return (
    <fieldset disabled={isLoading || !!error} className="m-0 p-0 border-0">
      <Section
        title="Automation"
        footer="Allow external MCP clients to access your devices through HomeCloud automation."
      >
        <Line title="MCP server">
          <div className="flex items-center gap-2">
            {info.isRunning && (
              <span className="text-xs text-muted-foreground font-mono">
                {info.url}
              </span>
            )}
            <Switch
              checked={info.isRunning}
              onCheckedChange={handleToggle}
              disabled={isToggling}
            />
          </div>
        </Line>
      </Section>
    </fieldset>
  );
}
