import { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent, RefreshControl } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { WorkflowExecution } from 'shared/types';
import { UIText } from '@/components/ui/UIText';
import { UIIcon } from '@/components/ui/UIIcon';
import { RunWorkflowModal } from '@/components/RunWorkflowModal';
import { workflowColorMap, defaultWorkflowColor } from '@/components/WorkflowCard';
import { useWorkflowDetail } from '@/hooks/useWorkflows';
import { useWorkflowActions } from '@/hooks/useWorkflowActions';
import { useManagedLoading } from '@/hooks/useManagedLoading';
import { cronToHuman, getBottomPadding, getLocalServiceController, isGlassEnabled } from '@/lib/utils';
import { useRefresh } from '@/hooks/useRefresh';
import { useThemeColor } from '@/hooks/useThemeColor';
import { UIView } from '@/components/ui/UIView';

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status?: string): string {
    switch (status) {
        case 'ok': return 'Completed';
        case 'error': return 'Failed';
        case 'timeout': return 'Timed out';
        case 'cancelled': return 'Cancelled';
        default: return 'Running';
    }
}

function formatDate(d: Date | string | undefined): string {
    if (!d) return '—';
    return new Date(d).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

function formatDuration(start: Date | string, end?: Date | string): string {
    if (!end) return 'running…';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}m ${remainSecs}s`;
}

// ── Glass Button ─────────────────────────────────────────────────────────────

function GlassButton({ icon, label, onPress, disabled }: {
    icon: React.ComponentProps<typeof UIIcon>['name'];
    label: string;
    onPress: () => void;
    disabled?: boolean;
}) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={({ pressed }) => [
                styles.glassButton,
                disabled && { opacity: 0.5 },
                pressed && { opacity: 0.7 },
            ]}
        >
            <UIIcon name={icon} size={14} color="#ffffff" />
            <UIText style={styles.glassButtonText} size="sm" font="medium">{label}</UIText>
        </Pressable>
    );
}

// ── Status Icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status?: string }) {
    switch (status) {
        case 'ok':
            return <UIIcon name="checkmark.circle.fill" size={16} color="#9ca3af" />;
        case 'error':
            return <UIIcon name="xmark.circle" size={16} color="#f87171" />;
        case 'timeout':
            return <UIIcon name="exclamationmark.triangle" size={16} color="#fbbf24" />;
        case 'cancelled':
            return <UIIcon name="nosign" size={16} color="#fbbf24" />;
        default:
            return <ActivityIndicator size="small" />;
    }
}

// ── Detail Row ───────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={styles.detailRow}>
            <UIText size="xs" color="textSecondary" style={styles.detailLabel}>{label}</UIText>
            <UIText size="xs" style={styles.detailValue}>{value}</UIText>
        </View>
    );
}

// ── Execution Row ────────────────────────────────────────────────────────────

function ExecutionRow({ exec, deviceFingerprint }: { exec: WorkflowExecution; deviceFingerprint: string | null }) {
    const [expanded, setExpanded] = useState(false);
    const separatorColor = useThemeColor({}, 'seperator');
    const { withLoading } = useManagedLoading();

    const handleOpenLog = useCallback(async () => {
        if (!exec.logFilePath) return;
        await withLoading(async () => {
            const localSc = getLocalServiceController();
            await localSc.files.openFile(deviceFingerprint, exec.logFilePath!);
        }, { title: 'Opening log…', errorTitle: 'Could not open log', delay: 0 });
    }, [exec.logFilePath, deviceFingerprint, withLoading]);

    return (
        <View style={[styles.execRow, { borderBottomColor: separatorColor }]}>
            <Pressable
                style={({ pressed }) => [
                    styles.execRowHeader,
                    pressed && { opacity: 0.7 },
                ]}
                onPress={() => setExpanded(prev => !prev)}
            >
                <StatusIcon status={exec.result?.status} />
                <UIText style={styles.execMessage} size="sm" numberOfLines={1} color="text">
                    {exec.result?.message || statusLabel(exec.result?.status)}
                </UIText>
                <UIText size="xs" color="textSecondary" style={{ flexShrink: 0 }}>
                    {formatDate(exec.startedAt)}
                </UIText>
                <UIIcon
                    name="chevron.right"
                    size={12}
                    themeColor="textTertiary"
                    style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }], marginLeft: 4 }}
                />
            </Pressable>

            {expanded && (
                <View style={styles.execDetails}>
                    <DetailRow label="Status" value={statusLabel(exec.result?.status)} />
                    <DetailRow label="Started" value={formatDate(exec.startedAt)} />
                    {exec.endedAt ? <DetailRow label="Ended" value={formatDate(exec.endedAt)} /> : null}
                    <DetailRow label="Duration" value={formatDuration(exec.startedAt, exec.endedAt)} />
                    {exec.result?.message ? <DetailRow label="Message" value={exec.result.message} /> : null}

                    {exec.logFilePath ? (
                        <Pressable
                            onPress={handleOpenLog}
                            style={({ pressed }) => [
                                styles.logButton,
                                pressed && { opacity: 0.7 },
                            ]}
                        >
                            <UIIcon name="doc.text" size={14} themeColor="highlight" />
                            <UIText size="sm" color="highlight" font="medium">Logs</UIText>
                        </Pressable>
                    ) : null}
                </View>
            )}
        </View>
    );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function WorkflowDetailScreen() {
    const { fingerprint, id } = useLocalSearchParams<{ fingerprint: string; id: string }>();
    const insets = useSafeAreaInsets();
    const bottomPadding = getBottomPadding(insets.bottom);
    const headerHeight = useHeaderHeight();

    const deviceFingerprint = fingerprint === 'local' ? null : fingerprint;
    const workflowId = id || null;

    const { config, executions, triggers, isLoading, reload } = useWorkflowDetail(deviceFingerprint, workflowId);
    const { refreshing, onRefresh } = useRefresh(reload, isLoading);
    const { handleRun, handleViewScript, runModalProps } = useWorkflowActions(deviceFingerprint);

    const bg = config?.color ? workflowColorMap[config.color] : defaultWorkflowColor;
    const [scrolledPastHeader, setScrolledPastHeader] = useState(false);

    const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        // Show header background once scrolled past the colored area
        const pastHeader = e.nativeEvent.contentOffset.y > headerHeight + 60;
        setScrolledPastHeader(prev => prev !== pastHeader ? pastHeader : prev);
    }, [headerHeight]);

    const triggerLabel = triggers.length > 0
        ? triggers.map(t => cronToHuman(t.data)).join(', ')
        : null;

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: scrolledPastHeader ? (config?.name || 'Workflow') : '',
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: true,
                    headerTintColor: scrolledPastHeader ? undefined : '#ffffff',
                    headerBackground: scrolledPastHeader && !isGlassEnabled
                        ? () => <UIView useGlass themeColor="background" style={{ flex: 1 }} />
                        : undefined,
                }}
            />
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: bottomPadding + 40 }}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                {/* Overscroll color extension */}
                <View style={{ backgroundColor: bg, height: 500, position: 'absolute', top: -500, left: 0, right: 0 }} />
                {/* Colored header */}
                <View style={[styles.header, { backgroundColor: bg, paddingTop: headerHeight + 12 }]}>
                    {config && !config.isEnabled && (
                        <UIText style={styles.disabledLabel} size="xs" font="semibold">
                            DISABLED
                        </UIText>
                    )}
                    <UIText style={styles.headerName} font="bold" size="xl" numberOfLines={2}>
                        {config?.name || 'Workflow'}
                    </UIText>
                    {config?.description ? (
                        <UIText style={styles.headerDesc} size="sm" numberOfLines={3}>
                            {config.description}
                        </UIText>
                    ) : null}
                    {config?.isEnabled && triggerLabel ? (
                        <View style={styles.triggerRow}>
                            <UIIcon name="clock" size={13} color="rgba(255,255,255,0.8)" />
                            <UIText style={styles.triggerText} size="xs">
                                {triggerLabel}
                            </UIText>
                        </View>
                    ) : null}

                    {/* Action buttons */}
                    <View style={styles.actionRow}>
                        <GlassButton icon="play.fill" label="Run" onPress={() => config && handleRun(config)} disabled={!config?.isEnabled} />
                        <GlassButton icon="chevron.left.forwardslash.chevron.right" label="Script" onPress={() => config && handleViewScript(config)} />
                    </View>
                </View>

                {/* Execution history */}
                <View style={styles.section}>
                    <UIText style={styles.sectionTitle} size="sm" font="semibold" color="textSecondary">
                        Recent Runs
                    </UIText>
                    {isLoading && executions.length === 0 ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator />
                        </View>
                    ) : executions.length === 0 ? (
                        <View style={styles.emptyRuns}>
                            <UIText size="sm" color="textSecondary">No runs yet.</UIText>
                        </View>
                    ) : (
                        executions.map(exec => (
                            <ExecutionRow
                                key={exec.id}
                                exec={exec}
                                deviceFingerprint={deviceFingerprint}
                            />
                        ))
                    )}
                </View>
            </ScrollView>
            <RunWorkflowModal {...runModalProps} />
        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    header: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerName: {
        color: '#ffffff',
    },
    headerDesc: {
        color: 'rgba(255,255,255,0.7)',
        marginTop: 4,
    },
    triggerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: 10,
    },
    triggerText: {
        color: 'rgba(255,255,255,0.8)',
    },
    disabledLabel: {
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 16,
    },
    glassButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    glassButtonText: {
        color: '#ffffff',
    },

    section: {
        marginTop: 1,
        minHeight: 120,
    },
    sectionTitle: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        letterSpacing: 0.5,
    },
    loadingContainer: {
        padding: 30,
        alignItems: 'center',
    },
    emptyRuns: {
        padding: 30,
        alignItems: 'center',
    },

    execRow: {
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    execRowHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    execMessage: {
        flex: 1,
    },
    execDetails: {
        paddingHorizontal: 20,
        paddingBottom: 14,
        paddingTop: 2,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    detailLabel: {
        width: 70,
    },
    detailValue: {
        flex: 1,
    },
    logButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        alignSelf: 'flex-start',
        paddingVertical: 4,
    },
});
