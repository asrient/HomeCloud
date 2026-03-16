import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { UIText } from './ui/UIText';
import { UIIcon } from './ui/UIIcon';
import { useRunningApps, useInstalledApps, useAppIcon } from '@/hooks/useApps';
import { RemoteAppInfo } from 'shared/types';

// ── App Icon Cell ──

function AppIconCell({
    app,
    deviceFingerprint,
    onPress,
}: {
    app: RemoteAppInfo;
    deviceFingerprint: string | null;
    onPress: (app: RemoteAppInfo) => void;
}) {
    const iconUri = useAppIcon(app.id, deviceFingerprint);

    return (
        <Pressable style={styles.appCell} onPress={() => onPress(app)}>
            <View style={styles.appIconContainer}>
                {iconUri ? (
                    <Image source={{ uri: iconUri }} style={styles.appIcon} />
                ) : (
                    <UIIcon name="app.fill" size={28} themeColor="icon" />
                )}
            </View>
            <UIText numberOfLines={1} size="xs" style={styles.appLabel}>
                {app.name}
            </UIText>
        </Pressable>
    );
}

// ── Running Apps Row (horizontal scroll, like StorageBox) ──

export function RunningAppsRow({
    fingerprint,
    onSelectApp,
}: {
    fingerprint: string | null;
    onSelectApp: (app: RemoteAppInfo) => void;
}) {
    const { runningApps, isLoading } = useRunningApps(fingerprint);

    if (isLoading && runningApps.length === 0) {
        return (
            <View style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator />
            </View>
        );
    }

    if (runningApps.length === 0) {
        return (
            <View style={{ flex: 1, width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
                <UIText color="textSecondary" size="sm" font="light">
                    No open apps
                </UIText>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, width: '100%', height: '100%' }}>
            <FlatList
                data={runningApps}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <AppIconCell
                        app={item}
                        deviceFingerprint={fingerprint}
                        onPress={onSelectApp}
                    />
                )}
            />
        </View>
    );
}

// ── All Apps Grid (expanded content) ──

export function AppsGrid({
    fingerprint,
    onSelectApp,
    dismiss,
}: {
    fingerprint: string | null;
    onSelectApp: (app: RemoteAppInfo) => void;
    dismiss: () => void;
}) {
    const { installedApps, isLoading } = useInstalledApps(fingerprint);

    const handlePress = useCallback((app: RemoteAppInfo) => {
        dismiss();
        onSelectApp(app);
    }, [dismiss, onSelectApp]);

    if (isLoading && installedApps.length === 0) {
        return (
            <View style={styles.gridLoading}>
                <ActivityIndicator />
            </View>
        );
    }

    return (
        <View style={styles.gridContainer}>
            <UIText style={{ marginBottom: 8, marginLeft: 4 }} size="md" font="semibold">
                All Apps
            </UIText>
            <FlatList
                data={installedApps}
                numColumns={4}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
                columnWrapperStyle={{ gap: 4 }}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <AppIconCell
                        app={item}
                        deviceFingerprint={fingerprint}
                        onPress={handlePress}
                    />
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    appCell: {
        width: 72,
        alignItems: 'center',
        paddingVertical: 4,
    },
    appIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(128,128,128,0.1)',
    },
    appIcon: {
        width: 48,
        height: 48,
        borderRadius: 12,
    },
    appLabel: {
        marginTop: 4,
        textAlign: 'center',
        maxWidth: 68,
    },
    gridContainer: {
        flex: 1,
        padding: 12,
    },
    gridLoading: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 200,
    },
});
