import { useCallback, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions, RefreshControl, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIText } from '@/components/ui/UIText';
import { WorkflowCard } from '@/components/WorkflowCard';
import { RunWorkflowModal } from '@/components/RunWorkflowModal';
import { useWorkflows } from '@/hooks/useWorkflows';
import { useWorkflowActions } from '@/hooks/useWorkflowActions';
import { isGlassEnabled, getBottomPadding } from '@/lib/utils';
import { WorkflowConfig } from 'shared/types';

const CARD_MIN_WIDTH = 155;
const GAP = 10;
const PADDING = 12;

export default function WorkflowsScreen() {
    const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const bottomPadding = getBottomPadding(insets.bottom);
    const headerHeight = useHeaderHeight();
    const { width: screenWidth } = useWindowDimensions();

    const deviceFingerprint = fingerprint === 'local' ? null : fingerprint;

    const numColumns = useMemo(() => {
        const available = screenWidth - PADDING * 2;
        return Math.max(2, Math.min(6, Math.floor((available + GAP) / (CARD_MIN_WIDTH + GAP))));
    }, [screenWidth]);

    const cardWidth = useMemo(() => {
        const available = screenWidth - PADDING * 2 - GAP * (numColumns - 1);
        return Math.floor(available / numColumns);
    }, [screenWidth, numColumns]);

    const { workflows, runningExecutions, isLoading, reload } = useWorkflows(deviceFingerprint);
    const { handleRun, handleViewScript, runModalProps } = useWorkflowActions(deviceFingerprint);

    const handleCardPress = useCallback((wf: WorkflowConfig) => {
        router.push({
            pathname: `/device/[fingerprint]/workflow`,
            params: { fingerprint, id: wf.id },
        } as any);
    }, [fingerprint, router]);

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: 'Workflows',
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: isGlassEnabled,
                }}
            />
            <ScrollView
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: bottomPadding + 40 },
                    isGlassEnabled && { paddingTop: headerHeight + 8 },
                ]}
                refreshControl={
                    <RefreshControl refreshing={isLoading} onRefresh={reload} />
                }
            >
                {workflows.length === 0 && !isLoading ? (
                    <View style={styles.emptyContainer}>
                        <UIText color="textSecondary" size="md">
                            No workflows yet.
                        </UIText>
                    </View>
                ) : (
                    <View style={styles.grid}>
                        {workflows.map(wf => (
                            <View key={wf.id} style={{ width: cardWidth }}>
                                <WorkflowCard
                                    workflow={wf}
                                    isRunning={runningExecutions.has(wf.id)}
                                    onPress={() => handleCardPress(wf)}
                                    onRun={() => handleRun(wf)}
                                    onViewScript={() => handleViewScript(wf)}
                                />
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
            <RunWorkflowModal {...runModalProps} />
        </View>
    );
}

const styles = StyleSheet.create({
    listContent: {
        padding: PADDING,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: GAP,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
});
