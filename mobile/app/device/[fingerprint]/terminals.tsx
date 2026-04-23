import { useCallback, useMemo } from 'react';
import { View, StyleSheet, useWindowDimensions, RefreshControl, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { UIPagePlaceholder } from '@/components/ui/UIPagePlaceholder';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { TerminalSessionCard } from '@/components/TerminalSessionCard';
import { useTerminalSessions } from '@/hooks/useTerminalSessions';
import { isGlassEnabled, getBottomPadding, getServiceController } from '@/lib/utils';
import { useRefresh } from '@/hooks/useRefresh';
import { UIButton } from '@/components/ui/UIButton';

const GAP = 10;
const PADDING = 12;

export default function TerminalsScreen() {
    const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
    const deviceFingerprint = fingerprint === 'local' ? null : fingerprint;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const bottomPadding = getBottomPadding(insets.bottom);
    const headerHeight = useHeaderHeight();
    const { width: screenWidth } = useWindowDimensions();

    const { sessions, isLoading, error, reload, killSession, isSessionsSupported } = useTerminalSessions(deviceFingerprint);
    const { refreshing, onRefresh } = useRefresh(reload, isLoading);

    const numColumns = screenWidth >= 768 ? 3 : screenWidth >= 480 ? 2 : 1;
    const cardWidth = useMemo(() => {
        const avail = screenWidth - PADDING * 2 - GAP * (numColumns - 1);
        return Math.floor(avail / numColumns);
    }, [screenWidth, numColumns]);

    const handleNew = useCallback(async () => {
        try {
            const sc = await getServiceController(deviceFingerprint);
            const entry = await sc.terminal.startTerminalSessionV2(undefined, true);
            router.push({ pathname: '/terminal', params: { fingerprint, sessionId: entry.sessionId } } as any);
        } catch {
            router.push({ pathname: '/terminal', params: { fingerprint } } as any);
        }
    }, [deviceFingerprint, fingerprint, router]);

    const handleOpen = useCallback((sessionId: string) => {
        router.push({ pathname: '/terminal', params: { fingerprint, sessionId } } as any);
    }, [fingerprint, router]);

    const handleKill = useCallback((sessionId: string) => {
        Alert.alert('Kill session?', 'This will terminate the terminal session and any running processes.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Kill', style: 'destructive', onPress: () => killSession(sessionId) },
        ]);
    }, [killSession]);

    const content = () => {
        if (isLoading && sessions.length === 0) {
            return (
                <View style={[styles.loadingContainer, isGlassEnabled && { paddingTop: headerHeight }]}>
                    <ActivityIndicator />
                </View>
            );
        }
        if (error) {
            return (
                <View style={[styles.loadingContainer, isGlassEnabled && { paddingTop: headerHeight }]}>
                    <UIPagePlaceholder title="Terminal not available" detail={error} />
                </View>
            );
        }
        if (!isSessionsSupported) {
            return (
                <UIPagePlaceholder title="Start a temporary terminal" detail="Update the device to use the new enhanced terminal with background sessions.">
                    <UIButton type="secondary" title="New Terminal" onPress={handleNew} style={{ marginTop: 12 }} />
                </UIPagePlaceholder>
            );
        }
        if (sessions.length === 0) {
            return (
                <UIPagePlaceholder title="Start a new terminal session" detail="Sessions can keep running in the background.">
                    <UIButton type="secondary" title="New Session" onPress={handleNew} style={{ marginTop: 12 }} />
                </UIPagePlaceholder>
            );
        }
        return (
            <ScrollView
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: bottomPadding + 40 },
                    isGlassEnabled && { paddingTop: headerHeight + 8 },
                ]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
            >
                <View style={styles.grid}>
                    {sessions.map(session => (
                        <View key={session.sessionId} style={{ width: cardWidth }}>
                            <TerminalSessionCard
                                session={session}
                                onPress={() => handleOpen(session.sessionId)}
                                onKill={() => handleKill(session.sessionId)}
                            />
                        </View>
                    ))}
                </View>
            </ScrollView>
        );
    };

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: 'Terminal',
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: isGlassEnabled,
                    headerRight: !error && !isLoading ? () => (
                        <UIHeaderButton name="plus" onPress={handleNew} />
                    ) : undefined,
                }}
            />
            {content()}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
