import { useMemo } from 'react';
import { Pressable, View, StyleSheet, ActivityIndicator } from 'react-native';
import { WorkflowConfig, WorkflowColor } from 'shared/types';
import { UIText } from './ui/UIText';
import { UIContextMenu, UIContextMenuAction } from './ui/UIContextMenu';

const colorMap: Record<WorkflowColor, string> = {
    red: '#ef4444',
    green: '#22c55e',
    blue: '#3b82f6',
    yellow: '#eab308',
    purple: '#a855f7',
    cyan: '#06b6d4',
};

const defaultColor = '#0ea5e9';

export function WorkflowCard({
    workflow,
    isRunning,
    onPress,
    onRun,
    onViewScript,
}: {
    workflow: WorkflowConfig;
    isRunning?: boolean;
    onPress?: () => void;
    onRun?: () => void;
    onViewScript?: () => void;
}) {
    const bg = workflow.color ? colorMap[workflow.color] : defaultColor;

    const menuActions = useMemo((): UIContextMenuAction[] => [
        { id: 'run', title: 'Run Now', icon: 'play.fill' },
        { id: 'script', title: 'View Script', icon: 'doc.text' },
    ], []);

    const handleMenuAction = (id: string) => {
        switch (id) {
            case 'run': onRun?.(); break;
            case 'script': onViewScript?.(); break;
        }
    };

    return (
        <UIContextMenu
            actions={menuActions}
            onAction={handleMenuAction}
            onPreviewPress={onPress}
            previewBackgroundColor={bg}
        >
            <Pressable
                onPress={onPress}
                style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: bg },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
            >
                <View style={styles.topRow}>
                    {isRunning && (
                        <View style={styles.runningBadge}>
                            <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" />
                            <UIText style={styles.runningText} size="xs" font="medium">
                                Running
                            </UIText>
                        </View>
                    )}
                </View>

                <View style={styles.bottomRow}>
                    <UIText
                        style={styles.nameText}
                        font="semibold"
                        size="sm"
                        numberOfLines={2}
                    >
                        {workflow.name}
                    </UIText>
                    {workflow.description ? (
                        <UIText
                            style={styles.descText}
                            size="xs"
                            numberOfLines={1}
                        >
                            {workflow.description}
                        </UIText>
                    ) : null}
                </View>
            </Pressable>
        </UIContextMenu>
    );
}

const styles = StyleSheet.create({
    card: {
        borderRadius: 22,
        padding: 14,
        height: 120,
        justifyContent: 'space-between',
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    runningBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    runningText: {
        color: 'rgba(255,255,255,0.9)',
    },
    bottomRow: {
        minWidth: 0,
    },
    nameText: {
        color: '#ffffff',
    },
    descText: {
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
});
