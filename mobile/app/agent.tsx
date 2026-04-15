import { useCallback, useMemo } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { UIText } from '@/components/ui/UIText';
import { UIPagePlaceholder } from '@/components/ui/UIPagePlaceholder';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useAgentConfig, useChatList } from '@/hooks/useAgent';
import { ChatInfo } from 'shared/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRefresh } from '@/hooks/useRefresh';
import { getBottomPadding, isGlassEnabled } from '@/lib/utils';
import { useHeaderHeight } from '@react-navigation/elements';
import { FlashList } from '@shopify/flash-list';

function formatDate(dateStr?: string | null) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
}

const statusDotColors: Record<string, string> = {
    unread: '#3b82f6',
    asking: '#f59e0b',
    error: '#ef4444',
    working: '#3b82f6',
};

function chatStatusLabel(chat: ChatInfo): { text: string; dotColor?: string } | null {
    if (chat.isUnread) return { text: 'New messages', dotColor: statusDotColors.unread };
    switch (chat.status) {
        case 'working': return { text: 'Working...' };
        case 'asking': return { text: 'Needs permission', dotColor: statusDotColors.asking };
        case 'error': return { text: 'Error', dotColor: statusDotColors.error };
        default: return null;
    }
}

function ChatListItem({ chat, onPress }: { chat: ChatInfo; onPress: () => void }) {
    const separatorColor = useThemeColor({}, 'seperator');
    const label = chatStatusLabel(chat);

    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.chatItem, { borderBottomColor: separatorColor, opacity: pressed ? 0.7 : 1 }]}>
            <View style={styles.chatItemContent}>
                <UIText numberOfLines={1} size="md" style={[styles.chatTitle, (!chat.isUnread && chat.status === 'idle') && { opacity: 0.7 } ]}>
                    {chat.title || 'Untitled chat'}
                </UIText>
                <View style={styles.chatMeta}>
                    <View style={styles.statusRow}>
                        {label && label.dotColor && <View style={[styles.statusDot, { backgroundColor: label.dotColor }]} />}
                        {label && <UIText size="sm" color="textSecondary">{label.text}</UIText>}
                    </View>
                    <UIText size="sm" color="textSecondary">{formatDate(chat.updatedAt)}</UIText>
                </View>
            </View>
        </Pressable>
    );
}

type ListItem = { type: 'header'; title: string } | { type: 'chat'; chat: ChatInfo };

export default function AgentScreen() {
    const { fingerprint } = useLocalSearchParams<{ fingerprint?: string }>();
    const deviceFingerprint = fingerprint === 'local' ? null : (fingerprint ?? null);
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const bottomPadding = getBottomPadding(insets.bottom);
    const headerHeight = useHeaderHeight();

    const { config, status } = useAgentConfig(deviceFingerprint);
    const { chats, isLoading, newChat, reload } = useChatList(deviceFingerprint);
    const { refreshing, onRefresh } = useRefresh(reload, isLoading);

    const title = config?.name ?? 'Agent';

    const listData = useMemo<ListItem[]>(() => {
        const review: ChatInfo[] = [];
        const working: ChatInfo[] = [];
        const inactive: ChatInfo[] = [];
        for (const chat of chats) {
            if (chat.isUnread || chat.status === 'asking' || chat.status === 'error') {
                review.push(chat);
            } else if (chat.status === 'working') {
                working.push(chat);
            } else {
                inactive.push(chat);
            }
        }
        const items: ListItem[] = [];
        if (review.length > 0) {
            items.push({ type: 'header', title: 'Review' });
            review.forEach(chat => items.push({ type: 'chat', chat }));
        }
        if (working.length > 0) {
            items.push({ type: 'header', title: 'In Progress' });
            working.forEach(chat => items.push({ type: 'chat', chat }));
        }
        if (inactive.length > 0) {
            items.push({ type: 'header', title: 'Inactive' });
            inactive.forEach(chat => items.push({ type: 'chat', chat }));
        }
        return items;
    }, [chats]);

    const openChat = useCallback((chat: ChatInfo) => {
        router.navigate({
            pathname: '/agent-chat',
            params: { fingerprint: fingerprint ?? 'local', chatId: chat.chatId },
        } as any);
    }, [router, fingerprint]);

    const handleNewChat = useCallback(async () => {
        try {
            const chat = await newChat();
            openChat(chat);
        } catch (err) {
            console.error('Failed to create chat:', err);
        }
    }, [newChat, openChat]);

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title,
                    headerRight: () => (
                        <UIHeaderButton name="plus" onPress={handleNewChat} />
                    ),
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: isGlassEnabled,
                }}
            />
            {status.connectionStatus !== 'ready' ? (
                <UIPagePlaceholder
                    title={
                        !config ? 'No agent configured' :
                        status.connectionStatus === 'error' ? 'Agent connection failed' :
                        status.connectionStatus === 'connecting' || status.connectionStatus === 'initializing' ? 'Connecting to agent...' :
                        'Agent disconnected'
                    }
                    detail={
                        !config ? 'Set up an agent in Settings to get started.' :
                        status.connectionStatus === 'error' ? (status.error || 'An unknown error occurred.') :
                        status.connectionStatus === 'connecting' || status.connectionStatus === 'initializing' ? `Setting up ${config.name || 'agent'}.` :
                        `${config.name || 'Agent'} is not running.`
                    }
                />
            ) : (
                <FlashList
                    data={listData}
                    getItemType={(item) => item.type}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    keyExtractor={(item, i) => item.type === 'chat' ? item.chat.chatId : `header-${i}`}
                    renderItem={({ item }) => {
                        if (item.type === 'header') {
                            return (
                                <View style={styles.sectionHeader}>
                                    <UIText type="subtitle">{item.title}</UIText>
                                </View>
                            );
                        }
                        return <ChatListItem chat={item.chat} onPress={() => openChat(item.chat)} />;
                    }}
                    contentContainerStyle={{ paddingBottom: bottomPadding + 20, paddingTop: isGlassEnabled ? headerHeight : 0 }}
                    scrollIndicatorInsets={isGlassEnabled ? { top: headerHeight } : undefined}
                    ListEmptyComponent={
                        isLoading ? (
                            <View style={styles.emptyContainer}>
                                <ActivityIndicator />
                            </View>
                        ) : (
                            <View style={styles.emptyContainer}>
                                <UIText color="textSecondary">No chats yet</UIText>
                            </View>
                        )
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    sectionHeader: {
        paddingHorizontal: 14,
        paddingTop: 22,
        paddingBottom: 8,
    },
    chatItem: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    chatItemContent: {
        gap: 1,
    },
    chatTitle: {
        fontWeight: '400',
    },
    chatMeta: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 60,
    },
});
