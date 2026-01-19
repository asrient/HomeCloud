import React, { useCallback, useMemo } from 'react';
import { NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';
import ContextMenu, { ContextMenuAction, ContextMenuOnPressNativeEvent } from 'react-native-context-menu-view';

/**
 * Simplified action item for the context menu
 */
export type UIContextMenuAction<T = unknown> = {
    /** Unique identifier for the action (used in onAction callback) */
    id: string;
    /** Display title for the action */
    title: string;
    /** SF Symbol icon name (iOS) */
    icon?: string;
    /** Whether this action is destructive (will be styled in red) */
    destructive?: boolean;
    /** Whether this action is currently selected/checked */
    selected?: boolean;
    /** Whether this action is disabled */
    disabled?: boolean;
    /** Nested submenu actions */
    actions?: UIContextMenuAction<T>[];
    /** Display children inline (iOS only) */
    inlineChildren?: boolean;
    /** Optional data payload associated with this action */
    data?: T;
};

export type UIContextMenuProps<T = unknown> = {
    /** Child elements to wrap with the context menu */
    children: React.ReactNode;
    /** Title displayed at the top of the context menu (iOS only) */
    title?: string;
    /** Array of menu actions */
    actions: UIContextMenuAction<T>[];
    /** Callback when an action is pressed. Receives action id, data, and index path. */
    onAction?: (id: string, data: T | undefined, indexPath: number[]) => void;
    /** Callback when preview is pressed (long press preview) */
    onPreviewPress?: () => void;
    /** Whether the context menu is disabled */
    disabled?: boolean;
    /** Display as dropdown menu (tap to open instead of long press) */
    dropdownMenuMode?: boolean;
    /** Custom style for the container */
    style?: StyleProp<ViewStyle>;
};

/**
 * Converts simplified UIContextMenuAction to library's ContextMenuAction format
 */
function convertToContextMenuAction<T>(action: UIContextMenuAction<T>): ContextMenuAction {
    const converted: ContextMenuAction = {
        title: action.title,
        systemIcon: action.icon,
        destructive: action.destructive,
        selected: action.selected,
        disabled: action.disabled,
        inlineChildren: action.inlineChildren,
    };

    if (action.actions && action.actions.length > 0) {
        converted.actions = action.actions.map(convertToContextMenuAction);
    }

    return converted;
}

/**
 * Finds action by index path and returns its id and data
 */
function findActionByIndexPath<T>(actions: UIContextMenuAction<T>[], indexPath: number[]): { id: string; data: T | undefined } | null {
    if (indexPath.length === 0) {
        return null;
    }

    let currentActions = actions;
    let action: UIContextMenuAction<T> | undefined;

    for (let i = 0; i < indexPath.length; i++) {
        const index = indexPath[i];
        action = currentActions[index];
        if (!action) {
            return null;
        }
        if (i < indexPath.length - 1 && action.actions) {
            currentActions = action.actions;
        }
    }

    return action ? { id: action.id, data: action.data } : null;
}

/**
 * UIContextMenu - A wrapper component for react-native-context-menu-view
 * 
 * Provides a simplified API for creating context menus with common patterns:
 * - Basic actions with icons
 * - Nested submenus
 * - Destructive and selected states
 * - Dropdown mode for header buttons
 * 
 * @example Basic usage:
 * ```tsx
 * <UIContextMenu
 *   actions={[
 *     { id: 'edit', title: 'Edit', icon: 'pencil' },
 *     { id: 'delete', title: 'Delete', icon: 'trash', destructive: true },
 *   ]}
 *   onAction={(id) => console.log('Selected:', id)}
 * >
 *   <YourComponent />
 * </UIContextMenu>
 * ```
 * 
 * @example With submenus and data:
 * ```tsx
 * <UIContextMenu
 *   actions={[
 *     { 
 *       id: 'send-to-device',
 *       title: 'Send to device',
 *       icon: 'arrow.up.message',
 *       actions: devices.map(d => ({
 *         id: 'send-device',
 *         title: d.name,
 *         data: d.fingerprint,
 *       }))
 *     },
 *   ]}
 *   onAction={(id, data) => {
 *     if (id === 'send-device') sendToDevice(data);
 *   }}
 * >
 *   <FileItem />
 * </UIContextMenu>
 * ```
 * 
 * @example Dropdown mode (for header buttons):
 * ```tsx
 * <UIContextMenu
 *   dropdownMenuMode
 *   actions={[...]}
 *   onAction={handleAction}
 * >
 *   <UIHeaderButton name="ellipsis.circle" />
 * </UIContextMenu>
 * ```
 */
export function UIContextMenu<T = unknown>({
    children,
    title,
    actions,
    onAction,
    onPreviewPress,
    disabled = false,
    dropdownMenuMode = false,
    style,
}: UIContextMenuProps<T>) {
    const convertedActions = useMemo(() => {
        return actions.map(convertToContextMenuAction);
    }, [actions]);

    const handlePress = useCallback((event: NativeSyntheticEvent<ContextMenuOnPressNativeEvent>) => {
        if (!onAction) {
            return;
        }
        const indexPath = event.nativeEvent.indexPath || [];
        const result = findActionByIndexPath(actions, indexPath);
        if (result) {
            onAction(result.id, result.data, indexPath);
        }
    }, [onAction, actions]);

    return (
        <ContextMenu
            title={title}
            actions={convertedActions}
            onPress={handlePress}
            onPreviewPress={onPreviewPress}
            disabled={disabled}
            dropdownMenuMode={dropdownMenuMode}
            style={style}
        >
            {children}
        </ContextMenu>
    );
}

// ============================================
// Helper functions for common action patterns
// ============================================

/**
 * Creates a simple action item
 */
export function createAction<T = unknown>(
    id: string,
    title: string,
    icon?: string,
    options?: Partial<Omit<UIContextMenuAction<T>, 'id' | 'title' | 'icon'>>
): UIContextMenuAction<T> {
    return {
        id,
        title,
        icon,
        ...options,
    };
}

/**
 * Creates a destructive action item (e.g., Delete)
 */
export function createDestructiveAction(
    id: string,
    title: string,
    icon?: string
): UIContextMenuAction {
    return {
        id,
        title,
        icon,
        destructive: true,
    };
}

/**
 * Creates a submenu action item
 */
export function createSubmenu<T = unknown>(
    id: string,
    title: string,
    icon: string,
    subActions: UIContextMenuAction<T>[],
    options?: { inlineChildren?: boolean }
): UIContextMenuAction<T> {
    return {
        id,
        title,
        icon,
        actions: subActions,
        inlineChildren: options?.inlineChildren,
    };
}

/**
 * Creates a selectable action item
 */
export function createSelectableAction(
    id: string,
    title: string,
    isSelected: boolean,
    icon?: string
): UIContextMenuAction {
    return {
        id,
        title,
        icon,
        selected: isSelected,
    };
}

/**
 * Helper to get parent index from indexPath
 * Useful for handling submenu selections
 */
export function getParentIndex(indexPath: number[]): number | null {
    return indexPath.length > 1 ? indexPath[0] : null;
}

/**
 * Helper to check if action is from a specific submenu
 */
export function isFromSubmenu(indexPath: number[], submenuIndex: number): boolean {
    return indexPath.length > 1 && indexPath[0] === submenuIndex;
}
