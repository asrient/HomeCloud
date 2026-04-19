import { memo, useCallback, useMemo, useState } from 'react';
import {
    View, StyleSheet, FlatList,
    ActivityIndicator, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { UIText } from '@/components/ui/UIText';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';
import { UITextInput } from '@/components/ui/UITextInput';
import { UIButton } from '@/components/ui/UIButton';
import { UIView } from '@/components/ui/UIView';
import { UIIcon, IconSymbolName } from '@/components/ui/UIIcon';
import { UIPageSheet } from '@/components/ui/UIPageSheet';
import { UIContextMenu } from '@/components/ui/UIContextMenu';
import { useThemeColor } from '@/hooks/useThemeColor';
import { useChat } from '@/hooks/useAgent';
import { AgentMessage, AgentToolCall, AgentMessageEntry, ChatStatus, AgentPermissionRequest } from 'shared/types';
import * as Clipboard from 'expo-clipboard';
import Markdown from 'react-native-markdown-display';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    KeyboardController,
    AndroidSoftInputModes,
    useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { isGlassEnabled } from '@/lib/utils';

// ── Action button (reusable for bubble actions) ──

function ActionButton({ icon, label, onPress }: { icon: IconSymbolName; label: string; onPress: () => void }) {
    const [active, setActive] = useState(false);

    const handlePress = useCallback(() => {
        onPress();
        setActive(true);
        setTimeout(() => setActive(false), 1500);
    }, [onPress]);

    return (
        <UIButton
            size="sm"
            icon={active ? 'checkmark' : icon}
            type="link"
            themeColor="textSecondary"
            title={active ? 'Done' : label}
            onPress={handlePress}
        />
    );
}

// ── Text selection modal ──

function TextSelectionModal({ text, visible, onClose }: { text: string; visible: boolean; onClose: () => void }) {
    return (
        <UIPageSheet isOpen={visible} title='Select Text' onClose={onClose}>
            <UITextInput
                value={text}
                variant='plain'
                multiline
                showSoftInputOnFocus={false}
                caretHidden
                style={{ flex: 1, padding: 16, paddingBottom: 20, textAlignVertical: 'top' }}
            />
        </UIPageSheet>
    );
}

// ── Message bubble ──

function ToolCallRow({ tc }: { tc: AgentToolCall }) {
    return (
        <View style={styles.toolCallRow}>
            <UIIcon
                name={tc.status === 'completed' ? 'checkmark.circle' : tc.status === 'failed' ? 'xmark.circle' : tc.status === 'in_progress' ? 'circle.dashed' : 'circle'}
                size={12}
                themeColor={tc.status === 'failed' ? undefined : 'textSecondary'}
                color={tc.status === 'failed' ? '#ef4444' : undefined}
            />
            <UIText size="xs" color="textSecondary" numberOfLines={1} style={{ flex: 1 }}>{tc.title}</UIText>
        </View>
    );
}

const MessageBubble = memo(function MessageBubble({ message, onSelectText }: { message: AgentMessage; onSelectText: (text: string) => void }) {
    const isUser = message?.role === 'user';
    const userBubbleColor = useThemeColor({}, 'highlight');
    const textColor = useThemeColor({}, 'text');
    const codeBgColor = useThemeColor({}, 'backgroundSecondary');
    const linkColor = useThemeColor({}, 'highlight');
    const secondaryTextColor = useThemeColor({}, 'textSecondary');

    const segments = useMemo(() => message?.entries ?? [], [message?.entries]);
    // Concatenated assistant text (used for the Copy/Select actions).
    const fullText = useMemo(
        () => segments
            .filter((e): e is Extract<AgentMessageEntry, { kind: 'content' }> => e.kind === 'content' && e.content.type === 'text')
            .map(e => (e.content as { type: 'text'; text: string }).text)
            .join('\n\n').trim(),
        [segments],
    );
    const hasAnyContent = segments.length > 0;

    const markdownStyles = {
        body: { color: textColor, fontSize: 16, lineHeight: 24 },
        paragraph: { marginTop: 0, marginBottom: 6 },
        code_inline: { backgroundColor: codeBgColor, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 8, fontSize: 14 },
        fence: { backgroundColor: codeBgColor, padding: 10, borderRadius: 8, fontSize: 14, marginVertical: 6 },
        code_block: { backgroundColor: codeBgColor, padding: 10, borderRadius: 12, fontSize: 14 },
        blockquote: { backgroundColor: codeBgColor, borderColor: secondaryTextColor, borderLeftWidth: 3, paddingHorizontal: 12, paddingVertical: 4, marginVertical: 6, borderRadius: 4 },
        heading1: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, marginTop: 8, marginBottom: 4, color: textColor },
        heading2: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26, marginTop: 6, marginBottom: 4, color: textColor },
        heading3: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24, marginTop: 4, marginBottom: 2, color: textColor },
        link: { color: linkColor },
        list_item: { marginVertical: 2 },
        hr: { backgroundColor: secondaryTextColor },
        table: { borderColor: codeBgColor },
        tr: { borderBottomColor: codeBgColor },
        th: { padding: 6, fontWeight: '600' as const, color: textColor },
        td: { padding: 6, color: textColor },
    };

    return (
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
            <View style={[
                styles.bubble,
                isUser ? [styles.bubbleUser, { backgroundColor: userBubbleColor }] : styles.bubbleAssistant,
            ]}>
                {!hasAnyContent ? (
                    <UIText size="sm" color="textSecondary" style={{ fontStyle: 'italic' }}>{'(non-text content)'}</UIText>
                ) : segments.map((seg, i) => {
                    if (seg.kind === 'tool_call') {
                        if (!seg.toolCall.title) return null;
                        return <ToolCallRow key={`tool-${seg.toolCall.toolCallId}-${i}`} tc={seg.toolCall} />;
                    }
                    if (seg.kind === 'thought') {
                        if (seg.content.type !== 'text') return null;
                        return (
                            <UIText
                                key={`thought-${i}`}
                                size="xs"
                                color="textSecondary"
                                style={{ fontStyle: 'italic', marginVertical: 4 }}
                            >
                                {seg.content.text}
                            </UIText>
                        );
                    }
                    // content
                    if (seg.content.type !== 'text') return null;
                    if (isUser) {
                        return (
                            <UIText key={`text-${i}`} selectable color='highlightText' size='md' font='regular'>
                                {seg.content.text}
                            </UIText>
                        );
                    }
                    return (
                        <Markdown
                            key={`text-${i}`}
                            style={markdownStyles}
                            onLinkPress={(url) => { Linking.openURL(url); return false; }}
                        >
                            {seg.content.text}
                        </Markdown>
                    );
                })}

                {!isUser && fullText ? (
                    <View style={styles.bubbleActions}>
                        <ActionButton icon="clipboard" label="Copy" onPress={() => Clipboard.setStringAsync(fullText)} />
                        <ActionButton icon="selection.pin.in.out" label="Select" onPress={() => onSelectText(fullText)} />
                    </View>
                ) : null}
            </View>
        </View>
    );
});

function PermissionPrompt({ permission, onRespond }: {
    permission: AgentPermissionRequest;
    onRespond: (optionId: string) => void;
}) {
    return (
        <UIView themeColor="backgroundSecondary" style={[styles.permissionBox]}>
            <View style={styles.permissionHeader}>
                <UIIcon name="shield.lefthalf.filled" size={14} themeColor="textSecondary" />
                <UIText size="xs" color="textSecondary">Agent is requesting permission to:</UIText>
            </View>
            <UIText size="sm" style={{ marginBottom: 10 }}>{permission.toolCall.title}</UIText>
            <View style={styles.permissionButtons}>
                {permission.options.map(opt => (
                    <UIButton
                        key={opt.optionId}
                        size="sm"
                        type={'secondary'}
                        title={opt.name}
                        onPress={() => onRespond(opt.optionId)}
                    />
                ))}
            </View>
        </UIView>
    );
}

// ── Status bar ──

function ChatStatusBar({ status }: { status: ChatStatus }) {
    if (status === 'idle') return null;
    const labels: Record<string, string> = {
        working: 'Agent is working...',
        asking: 'Agent needs permission',
        error: 'Error occurred',
    };
    return (
        <View style={styles.statusBar}>
            <UIText size="xs" color="textSecondary">{labels[status] ?? status}</UIText>
        </View>
    );
}

// ── Main chat view ──

export default function AgentChatScreen() {
    const { fingerprint, chatId } = useLocalSearchParams<{ fingerprint: string; chatId: string }>();
    const deviceFingerprint = fingerprint === 'local' ? null : (fingerprint ?? null);
    const insets = useSafeAreaInsets();

    const {
        chatInfo, messages, status, isLoading, pendingPermission,
        configOptions, sendMessage, cancelMessage,
        respondToPermission, setChatConfig,
    } = useChat(deviceFingerprint, chatId ?? null);

    const [input, setInput] = useState('');
    const [selectText, setSelectText] = useState<string | null>(null);
    const { progress: kbProgress, height: kbHeight } = useReanimatedKeyboardAnimation();
    // kbHeight is 0 when closed and -keyboardHeight when open.
    // We shrink the container ourselves so the FlatList resizes too. On Android with
    // edge-to-edge enabled, SOFT_INPUT_ADJUST_RESIZE no longer resizes the window
    // (the keyboard is reported as an inset), so we need to apply the padding on
    // both platforms.
    const containerAnimatedStyle = useAnimatedStyle(() => ({
        paddingBottom: -kbHeight.value,
    }));
    const inputBarAnimatedStyle = useAnimatedStyle(() => ({
        // Only apply the bottom safe-area inset when the keyboard is closed.
        paddingBottom: (1 - kbProgress.value) * insets.bottom + 6,
    }));

    // On Android, switch to adjustResize for this screen only so the keyboard
    // resizes the view instead of panning (which hides the header).
    useFocusEffect(
        useCallback(() => {
            KeyboardController.setInputMode(AndroidSoftInputModes.SOFT_INPUT_ADJUST_RESIZE);
            return () => KeyboardController.setDefaultMode();
        }, []),
    );

    // Client-side pagination: start with the latest PAGE_SIZE messages,
    // load more when scrolling toward older messages.
    const PAGE_SIZE = 10;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

    const loadMore = useCallback(() => {
        setVisibleCount(prev => Math.min(prev + PAGE_SIZE, messages.length));
    }, [messages.length]);

    const listData = useMemo(() => {
        const slice = messages.slice(-visibleCount);
        return [...slice].reverse();
    }, [messages, visibleCount]);

    const hasMore = visibleCount < messages.length;

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text || status === 'working') return;
        setInput('');
        sendMessage(text);
    }, [input, status, sendMessage]);

    const title = chatInfo?.title || 'Chat';

    const configMenuActions = configOptions.map(opt => ({
        id: opt.key,
        title: opt.name,
        actions: opt.values.map(v => ({
            id: `${opt.key}::${v.value}`,
            title: v.name,
            selected: v.value === opt.currentValue,
        })),
    }));

    return (
        <Animated.View style={[styles.container, containerAnimatedStyle]}>
            <Stack.Screen
                options={{
                    title,
                    headerBackButtonDisplayMode: 'minimal',
                    headerTransparent: false,
                    ...(isGlassEnabled ? {
                        headerBackground: () => <UIView themeColor="background" style={{ flex: 1 }} />,
                        headerShadowVisible: false,
                    } : {}),
                    headerRight: configOptions.length > 0 ? () => (
                        <UIContextMenu
                            dropdownMenuMode
                            actions={configMenuActions}
                            onAction={(id) => {
                                const [key, value] = id.split('::');
                                if (key && value) setChatConfig(key, value);
                            }}
                        >
                            <UIHeaderButton name="slider.horizontal.3" />
                        </UIContextMenu>
                    ) : undefined,
                }}
            />

            {/* Messages */}
            <FlatList
                data={listData}
                inverted
                keyExtractor={(_, i) => String(i)}
                renderItem={({ item }) => <MessageBubble message={item} onSelectText={setSelectText} />}
                contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 14, paddingBottom: 8, paddingTop: 8 }}
                onEndReached={hasMore ? loadMore : undefined}
                onEndReachedThreshold={0.5}
                ListFooterComponent={hasMore ? () => <ActivityIndicator style={{ paddingVertical: 12 }} /> : undefined}
                ListEmptyComponent={
                    isLoading ? (
                        <View style={styles.emptyContainer}><ActivityIndicator /></View>
                    ) : (
                        <View style={styles.emptyContainer}>
                            <UIText color="textSecondary">Ready when you are.</UIText>
                        </View>
                    )
                }
            />

            {/* Permission prompt */}
            {pendingPermission && (
                <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
                    <PermissionPrompt permission={pendingPermission} onRespond={respondToPermission} />
                </View>
            )}

            {/* Status */}
            <ChatStatusBar status={status} />

            {/* Input bar */}
            <Animated.View style={[styles.inputBar, inputBarAnimatedStyle]}>
                <UIView useGlass themeColor="backgroundTertiary" style={styles.inputWrapper}>
                    <UITextInput
                        variant="plain"
                        style={styles.textInput}
                        placeholder="Type a message..."
                        value={input}
                        onChangeText={setInput}
                        multiline
                        editable={status !== 'working' && status !== 'asking'}
                        submitBehavior="newline"
                    />
                    {status === 'working' ? (
                        <UIButton type="link" icon="stop.fill" onPress={cancelMessage} color="#ef4444" />
                    ) : (
                        <UIButton
                            type="link"
                            icon="arrow.up.circle.fill"
                            onPress={handleSend}
                            disabled={!input.trim() || status === 'asking'}
                            themeColor={input.trim() ? 'highlight' : 'textSecondary'}
                        />
                    )}
                </UIView>
            </Animated.View>
            <TextSelectionModal text={selectText ?? ''} visible={!!selectText} onClose={() => setSelectText(null)} />
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    bubbleRow: {
        marginVertical: 15,
        flexDirection: 'row',
    },
    bubbleRowUser: {
        justifyContent: 'flex-end',
    },
    bubbleRowAssistant: {
        justifyContent: 'flex-start',
    },
    bubble: {
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    bubbleUser: {
        maxWidth: '85%',
        borderRadius: 20,
    },
    bubbleAssistant: {
        maxWidth: '100%',
    },
    toolCallsContainer: {
        marginBottom: 12,
        gap: 2,
    },
    toolCallRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    permissionBox: {
        borderRadius: 12,
        padding: 14,
    },
    permissionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 6,
    },
    permissionButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    statusBar: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 4,
    },
    inputBar: {
        paddingHorizontal: 10,
        paddingTop: 6,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 30,
        paddingLeft: 14,
        paddingRight: 4,
        minHeight: 44,
    },
    textInput: {
        flex: 1,
        fontSize: 16,
        maxHeight: 120,
        paddingVertical: 8,
        paddingHorizontal: 0,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    bubbleActions: {
        flexDirection: 'row',
        marginTop: 4,
        gap: 1,
    },
});
