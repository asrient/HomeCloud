import { useMemo } from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { TerminalSessionEntry } from 'shared/types';
import { UIText } from './ui/UIText';
import { UIContextMenu, UIContextMenuAction } from './ui/UIContextMenu';
import { UIIcon } from './ui/UIIcon';
import { UIView } from './ui/UIView';
import { isIos } from '@/lib/utils';

export function TerminalSessionCard({
    session,
    onPress,
    onKill,
}: {
    session: TerminalSessionEntry;
    onPress?: () => void;
    onKill?: () => void;
}) {
    const menuActions = useMemo((): UIContextMenuAction[] => [
        { id: 'open', title: 'Open', icon: 'terminal.fill' },
        { id: 'kill', title: 'Kill Session', icon: 'xmark.circle', destructive: true },
    ], []);

    const handleMenuAction = (id: string) => {
        switch (id) {
            case 'open': onPress?.(); break;
            case 'kill': onKill?.(); break;
        }
    };

    return (
        <UIContextMenu
            actions={menuActions}
            onAction={handleMenuAction}
            onPreviewPress={onPress}
            previewBackgroundColor="#3f3f46"
        >
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    pressed && { opacity: 0.85 },
                ]}
            >
                <UIView themeColor='backgroundTertiary' style={styles.card}>
                    <View style={styles.topRow}>
                        <UIIcon name="terminal.fill" size={14} themeColor='textSecondary' />
                        <UIText color='textSecondary' size="xs">{session.pid}</UIText>
                    </View>

                    <View style={styles.bottomRow}>
                        <UIText
                            color='text'
                            font="semibold"
                            size="md"
                            numberOfLines={1}
                        >
                            {session.processName}
                        </UIText>
                        <UIText
                            style={styles.shellText}
                            size="xs"
                            numberOfLines={1}
                        >
                            {session.shell}
                        </UIText>
                    </View>
                </UIView>
            </Pressable>
        </UIContextMenu>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: isIos ? 24 : 12,
        padding: 18,
        height: 100,
        justifyContent: 'space-between',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    bottomRow: {
        minWidth: 0,
    },
    shellText: {
        marginTop: 2,
    },
});
