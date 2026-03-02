import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    ActivityIndicator,
    Pressable,
    Image,
    ScrollView,
    Dimensions,
    Modal,
    TextInput,
    Platform,
    KeyboardAvoidingView,
    GestureResponderEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UIText } from '@/components/ui/UIText';
import { UIButton } from '@/components/ui/UIButton';
import { UIView } from '@/components/ui/UIView';
import { UIIcon } from '@/components/ui/UIIcon';
import { useAppWindows, useWindowCapture, useWindowActions } from '@/hooks/useApps';
import { useThemeColor } from '@/hooks/useThemeColor';
import {
    RemoteAppWindow,
    RemoteAppWindowAction,
    RemoteAppWindowType,
    RemoteAppWindowUIState,
} from 'shared/types';
import { isGlassEnabled, getServiceController } from '@/lib/utils';

// ── Constants ──

const TILE_SIZE = 64;
const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const POINTER_MOVE_SENSITIVITY = 1.5;

type ControlMode = 'pointer' | 'touch';
type TouchSubMode = 'scroll' | 'select';

// ── Window Canvas ──

function WindowCanvas({
    uiState,
    controlMode,
    touchSubMode,
    dispatchAction,
    canvasWidth,
    canvasHeight,
}: {
    uiState: RemoteAppWindowUIState;
    controlMode: ControlMode;
    touchSubMode: TouchSubMode;
    dispatchAction: (payload: any) => void;
    canvasWidth: number;
    canvasHeight: number;
}) {
    // Build full image from tiles. We use an offscreen approach storing tile images.
    const tileImages = useRef<Map<string, { uri: string; ts: number }>>(new Map());

    // Scale factor: fit remote window into canvasWidth/canvasHeight
    const scale = useMemo(() => {
        if (!uiState) return 1;
        const sx = canvasWidth / uiState.width;
        const sy = canvasHeight / uiState.height;
        return Math.min(sx, sy, 1);
    }, [uiState, canvasWidth, canvasHeight]);

    const displayWidth = uiState.width * scale;
    const displayHeight = uiState.height * scale;

    // Pointer mode state
    const pointerPos = useRef<{ x: number; y: number }>({
        x: uiState.width / 2,
        y: uiState.height / 2,
    });
    const [pointerDisplay, setPointerDisplay] = useState<{ x: number; y: number }>({
        x: 0.5,
        y: 0.5,
    });

    // Touch tracking
    const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const lastTapRef = useRef<number>(0);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isDraggingRef = useRef(false);
    const touchCountRef = useRef(0);
    const isScrollingRef = useRef(false);
    const lastScrollPosRef = useRef<{ x: number; y: number } | null>(null);

    // Convert touch position on the view to remote window coordinates
    const touchToWindowCoords = useCallback(
        (pageX: number, pageY: number, viewLayout: { x: number; y: number }) => {
            const relX = pageX - viewLayout.x;
            const relY = pageY - viewLayout.y;
            return {
                x: Math.round(relX / scale),
                y: Math.round(relY / scale),
            };
        },
        [scale],
    );

    const viewLayoutRef = useRef<{ x: number; y: number; width: number; height: number }>({
        x: 0, y: 0, width: 0, height: 0,
    });

    const onViewLayout = useCallback((e: any) => {
        e.target.measure((_x: number, _y: number, width: number, height: number, pageX: number, pageY: number) => {
            viewLayoutRef.current = { x: pageX, y: pageY, width, height };
        });
    }, []);

    // ── Touch handlers ──

    const handleTouchStart = useCallback(
        (e: GestureResponderEvent) => {
            const touch = e.nativeEvent;
            touchCountRef.current = touch.touches?.length || 1;
            const pageX = touch.pageX;
            const pageY = touch.pageY;
            touchStartRef.current = { x: pageX, y: pageY, time: Date.now() };
            isDraggingRef.current = false;

            // Long press detection
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = setTimeout(() => {
                // Long press = right click
                if (controlMode === 'pointer') {
                    const pos = pointerPos.current;
                    dispatchAction({
                        action: RemoteAppWindowAction.RightClick,
                        x: Math.round(pos.x),
                        y: Math.round(pos.y),
                    });
                } else {
                    const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                    dispatchAction({
                        action: RemoteAppWindowAction.RightClick,
                        x: coords.x,
                        y: coords.y,
                    });
                }
                longPressTimerRef.current = null;
            }, LONG_PRESS_MS);
        },
        [controlMode, dispatchAction, touchToWindowCoords],
    );

    const handleTouchMove = useCallback(
        (e: GestureResponderEvent) => {
            const touch = e.nativeEvent;
            const pageX = touch.pageX;
            const pageY = touch.pageY;
            const numTouches = touch.touches?.length || 1;

            // Cancel long press if moved significantly
            if (touchStartRef.current) {
                const dx = pageX - touchStartRef.current.x;
                const dy = pageY - touchStartRef.current.y;
                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    if (longPressTimerRef.current) {
                        clearTimeout(longPressTimerRef.current);
                        longPressTimerRef.current = null;
                    }
                }
            }

            // Two-finger scroll
            if (numTouches >= 2) {
                // Cancel any in-progress drag when transitioning to scroll
                if (isDraggingRef.current && controlMode === 'touch') {
                    const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                    dispatchAction({
                        action: RemoteAppWindowAction.DragEnd,
                        x: coords.x,
                        y: coords.y,
                    });
                    isDraggingRef.current = false;
                }
                if (!isScrollingRef.current) {
                    isScrollingRef.current = true;
                    lastScrollPosRef.current = { x: pageX, y: pageY };
                    return;
                }
                if (lastScrollPosRef.current) {
                    const sdx = Math.round((pageX - lastScrollPosRef.current.x) / 3);
                    const sdy = Math.round((pageY - lastScrollPosRef.current.y) / 3);
                    if (sdx !== 0 || sdy !== 0) {
                        const pos = controlMode === 'pointer' ? pointerPos.current
                            : touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                        dispatchAction({
                            action: RemoteAppWindowAction.Scroll,
                            x: Math.round(pos.x),
                            y: Math.round(pos.y),
                            scrollDeltaX: -sdx,
                            scrollDeltaY: -sdy,
                        });
                        lastScrollPosRef.current = { x: pageX, y: pageY };
                    }
                }
                return;
            }

            if (controlMode === 'pointer') {
                // Trackpad mode: move pointer relative to finger movement
                if (touchStartRef.current) {
                    const dx = (pageX - touchStartRef.current.x) * POINTER_MOVE_SENSITIVITY;
                    const dy = (pageY - touchStartRef.current.y) * POINTER_MOVE_SENSITIVITY;

                    if (!isDraggingRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        isDraggingRef.current = true;
                    }

                    if (isDraggingRef.current) {
                        const newX = Math.max(0, Math.min(uiState.width, pointerPos.current.x + dx));
                        const newY = Math.max(0, Math.min(uiState.height, pointerPos.current.y + dy));
                        pointerPos.current = { x: newX, y: newY };
                        setPointerDisplay({
                            x: newX / uiState.width,
                            y: newY / uiState.height,
                        });
                        touchStartRef.current = { x: pageX, y: pageY, time: touchStartRef.current.time };

                        dispatchAction({
                            action: RemoteAppWindowAction.Hover,
                            x: Math.round(newX),
                            y: Math.round(newY),
                        });
                    }
                }
            } else if (touchSubMode === 'select') {
                // Touch select mode: direct mapping, drag
                // Require deliberate movement before starting a drag so
                // a second finger can land for scroll without triggering drag
                if (!isDraggingRef.current) {
                    if (touchStartRef.current) {
                        const dx = pageX - touchStartRef.current.x;
                        const dy = pageY - touchStartRef.current.y;
                        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                            isDraggingRef.current = true;
                            const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                            dispatchAction({
                                action: RemoteAppWindowAction.DragStart,
                                x: coords.x,
                                y: coords.y,
                            });
                        }
                    }
                } else {
                    const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                    dispatchAction({
                        action: RemoteAppWindowAction.DragMove,
                        x: coords.x,
                        y: coords.y,
                    });
                }
            } else {
                // Touch scroll mode: one-finger movement sends scroll events
                if (!isScrollingRef.current) {
                    isScrollingRef.current = true;
                    lastScrollPosRef.current = { x: pageX, y: pageY };
                } else if (lastScrollPosRef.current) {
                    const sdx = Math.round((pageX - lastScrollPosRef.current.x) / 3);
                    const sdy = Math.round((pageY - lastScrollPosRef.current.y) / 3);
                    if (sdx !== 0 || sdy !== 0) {
                        const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                        dispatchAction({
                            action: RemoteAppWindowAction.Scroll,
                            x: coords.x,
                            y: coords.y,
                            scrollDeltaX: -sdx,
                            scrollDeltaY: -sdy,
                        });
                        lastScrollPosRef.current = { x: pageX, y: pageY };
                    }
                }
            }
        },
        [controlMode, touchSubMode, dispatchAction, touchToWindowCoords, uiState?.width, uiState?.height],
    );

    const handleTouchEnd = useCallback(
        (e: GestureResponderEvent) => {
            if (longPressTimerRef.current) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }

            // Reset scroll state
            if (isScrollingRef.current) {
                isScrollingRef.current = false;
                lastScrollPosRef.current = null;
                touchStartRef.current = null;
                isDraggingRef.current = false;
                touchCountRef.current = 0;
                return;
            }

            const touch = e.nativeEvent;
            const pageX = touch.pageX;
            const pageY = touch.pageY;

            // 2-finger tap = right click
            if (touchCountRef.current >= 2 && !isDraggingRef.current) {
                if (controlMode === 'pointer') {
                    const pos = pointerPos.current;
                    dispatchAction({
                        action: RemoteAppWindowAction.RightClick,
                        x: Math.round(pos.x),
                        y: Math.round(pos.y),
                    });
                } else {
                    const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                    dispatchAction({
                        action: RemoteAppWindowAction.RightClick,
                        x: coords.x,
                        y: coords.y,
                    });
                }
                touchStartRef.current = null;
                isDraggingRef.current = false;
                touchCountRef.current = 0;
                return;
            }

            if (isDraggingRef.current) {
                if (controlMode === 'touch') {
                    const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                    dispatchAction({
                        action: RemoteAppWindowAction.DragEnd,
                        x: coords.x,
                        y: coords.y,
                    });
                }
                isDraggingRef.current = false;
                touchStartRef.current = null;
                touchCountRef.current = 0;
                return;
            }

            // Tap = click (pointer mode: click at pointer position, touch mode: click at touch position)
            const now = Date.now();
            const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_MS;
            lastTapRef.current = now;

            if (controlMode === 'pointer') {
                const pos = pointerPos.current;
                dispatchAction({
                    action: isDoubleTap
                        ? RemoteAppWindowAction.DoubleClick
                        : RemoteAppWindowAction.Click,
                    x: Math.round(pos.x),
                    y: Math.round(pos.y),
                });
            } else {
                const coords = touchToWindowCoords(pageX, pageY, viewLayoutRef.current);
                dispatchAction({
                    action: isDoubleTap
                        ? RemoteAppWindowAction.DoubleClick
                        : RemoteAppWindowAction.Click,
                    x: coords.x,
                    y: coords.y,
                });
            }

            touchStartRef.current = null;
            isDraggingRef.current = false;
            touchCountRef.current = 0;
        },
        [controlMode, dispatchAction, touchToWindowCoords],
    );

    // Build tile grid
    const tileElements = useMemo(() => {
        const elements: React.ReactNode[] = [];
        for (const tile of uiState.tiles) {
            const key = `${tile.xIndex}_${tile.yIndex}`;
            const cached = tileImages.current.get(key);
            if (!cached || cached.ts !== tile.timestamp) {
                tileImages.current.set(key, {
                    uri: `data:image/jpeg;base64,${tile.image}`,
                    ts: tile.timestamp,
                });
            }
            const tileData = tileImages.current.get(key)!;
            elements.push(
                <Image
                    key={key}
                    source={{ uri: tileData.uri }}
                    style={{
                        position: 'absolute',
                        left: Math.floor(tile.xIndex * TILE_SIZE * scale),
                        top: Math.floor(tile.yIndex * TILE_SIZE * scale),
                        width: Math.ceil(tile.width * scale) + 1,
                        height: Math.ceil(tile.height * scale) + 1,
                    }}
                    resizeMode="cover"
                />,
            );
        }
        return elements;
    }, [uiState.tiles, scale]);

    return (
        <View
            style={[styles.canvasContainer, { width: displayWidth, height: displayHeight }]}
            onLayout={onViewLayout}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={handleTouchStart}
            onResponderMove={handleTouchMove}
            onResponderRelease={handleTouchEnd}
        >
            {tileElements}

            {/* Pointer cursor overlay in pointer mode */}
            {controlMode === 'pointer' && (
                <View
                    pointerEvents="none"
                    style={[
                        styles.pointerCursor,
                        {
                            left: pointerDisplay.x * displayWidth - 6,
                            top: pointerDisplay.y * displayHeight - 2,
                        },
                    ]}
                >
                    <UIIcon name="cursorarrow" size={16} color="#fff" />
                </View>
            )}
        </View>
    );
}

// ── Keyboard Input Modal ──

function KeyboardInput({
    visible,
    onClose,
    dispatchAction,
}: {
    visible: boolean;
    onClose: () => void;
    dispatchAction: (payload: any) => void;
}) {
    const [text, setText] = useState('');
    const inputRef = useRef<TextInput>(null);
    const separatorColor = useThemeColor({}, 'seperator');

    useEffect(() => {
        if (visible) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [visible]);


    const handleKeyPress = useCallback(
        (e: any) => {
            const key = e.nativeEvent.key;
            // Special keys
            if (key === 'Backspace') {
                dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Backspace' });
            } else if (key === 'Enter') {
                dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Return' });
            } else if (key === 'Tab') {
                dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Tab' });
            } else if (key === 'Escape') {
                dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Escape' });
                onClose();
            }
        },
        [dispatchAction, onClose],
    );

    const handleTextChange = useCallback(
        (newText: string) => {
            // For character-by-character input
            if (newText.length > text.length) {
                const added = newText.slice(text.length);
                dispatchAction({ action: RemoteAppWindowAction.TextInput, text: added });
            }
            setText(newText);
        },
        [text, dispatchAction],
    );

    if (!visible) return null;

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardContainer}
        >
            <View style={[styles.keyboardBar, { borderTopColor: separatorColor }]}>
                <UIView
                    themeColor="backgroundTertiary"
                    style={styles.keyboardInputWrapper}
                >
                    <TextInput
                        ref={inputRef}
                        style={styles.keyboardInput}
                        value={text}
                        onChangeText={handleTextChange}
                        onKeyPress={handleKeyPress}
                        placeholder="Type here..."
                        placeholderTextColor="rgba(255,255,255,0.3)"
                        autoCapitalize="none"
                        autoCorrect={false}
                        blurOnSubmit={false}
                        onSubmitEditing={() => {
                            dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Return' });
                        }}
                    />
                </UIView>
                <UIButton icon="xmark" type="link" themeColor="textSecondary" onPress={onClose} />
            </View>
        </KeyboardAvoidingView>
    );
}

// ── Child Window Modal (for context menus, popups, modals) ──

function ChildWindowModal({
    window: childWindow,
    deviceFingerprint,
    onClose,
}: {
    window: RemoteAppWindow;
    deviceFingerprint: string | null;
    onClose: () => void;
}) {
    const { uiState, isConnecting, error, startCapture, stopCapture } = useWindowCapture(
        childWindow.id,
        deviceFingerprint,
    );
    const { dispatchAction } = useWindowActions(childWindow.id, deviceFingerprint);
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;

    useEffect(() => {
        startCapture();
        return () => stopCapture();
    }, [startCapture, stopCapture]);

    // Close the modal if the child window disappears
    useEffect(() => {
        if (error) onClose();
    }, [error, onClose]);

    const maxWidth = screenWidth * 0.9;
    const maxHeight = screenHeight * 0.7;

    return (
        <Modal visible transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.modalOverlay} onPress={onClose}>
                <Pressable
                    style={styles.modalContent}
                    onPress={(e) => e.stopPropagation()}
                >
                    {isConnecting && !uiState ? (
                        <View style={styles.modalLoading}>
                            <ActivityIndicator color="#fff" />
                            <UIText color="textSecondary" size="sm">
                                Loading...
                            </UIText>
                        </View>
                    ) : uiState ? (
                        <WindowCanvas
                            uiState={uiState}
                            controlMode="touch"
                            touchSubMode="scroll"
                            dispatchAction={dispatchAction}
                            canvasWidth={maxWidth}
                            canvasHeight={maxHeight}
                        />
                    ) : null}
                </Pressable>
            </Pressable>
        </Modal>
    );
}

// ── Window Tab Bar ──

function WindowTabBar({
    windows,
    selectedWindowId,
    onSelectWindow,
}: {
    windows: RemoteAppWindow[];
    selectedWindowId: string | null;
    onSelectWindow: (id: string) => void;
}) {
    const highlightColor = useThemeColor({}, 'highlight');

    if (windows.length <= 1) return null;

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarContent}
            style={styles.tabBar}
        >
            {windows.map((w) => {
                const isSelected = w.id === selectedWindowId;
                return (
                    <Pressable
                        key={w.id}
                        style={[
                            styles.tabItem,
                            isSelected && { borderBottomColor: highlightColor, borderBottomWidth: 2 },
                        ]}
                        onPress={() => onSelectWindow(w.id)}
                    >
                        <UIText
                            numberOfLines={1}
                            size="sm"
                            color={isSelected ? 'highlight' : 'textSecondary'}
                        >
                            {w.title || 'Window'}
                        </UIText>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

// ── Main Screen Control Page ──

export default function ScreenControlScreen() {
    const router = useRouter();
    const { fingerprint, appId, appName } = useLocalSearchParams<{
        fingerprint: string;
        appId: string;
        appName?: string;
    }>();
    const insets = useSafeAreaInsets();
    const deviceFingerprint = fingerprint === 'local' ? null : fingerprint;

    const [controlMode, setControlMode] = useState<ControlMode>('touch');
    const [touchSubMode, setTouchSubMode] = useState<TouchSubMode>('scroll');
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

    // Fetch windows for this app
    const { windows, isLoading: isLoadingWindows } = useAppWindows(appId || null, deviceFingerprint);

    // Compute ideal remote window size from mobile screen dimensions.
    // We target a 3:4 aspect (portrait-ish) with the width capped to
    // a reasonable desktop value so content stays usable.
    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;
    const canvasAreaHeight = screenHeight - insets.top - insets.bottom - 120; // toolbar + tabs

    const idealSize = useMemo(() => {
        // Match the mobile canvas aspect ratio so the remote window fills
        // the phone screen without letterboxing.
        const canvasW = screenWidth - 16;
        const canvasH = canvasAreaHeight - 16;
        const aspect = canvasW / canvasH; // < 1 in portrait

        // Be aggressive: target a narrow width (480px) and derive height.
        // Many apps (Terminal, editors) can go quite narrow.
        const targetWidth = 480;
        const targetHeight = Math.round(targetWidth / aspect);
        return { width: targetWidth, height: targetHeight, aspect };
    }, [screenWidth, canvasAreaHeight]);

    // Separate main windows from child/overlay windows
    const { mainWindows, childWindows } = useMemo(() => {
        const main: RemoteAppWindow[] = [];
        const children: RemoteAppWindow[] = [];
        for (const w of windows) {
            if (w.isHidden || w.isMinimized) continue;
            const t = w.type as RemoteAppWindowType;
            if (
                t === RemoteAppWindowType.ContextMenu ||
                t === RemoteAppWindowType.Tooltip ||
                t === RemoteAppWindowType.Popup ||
                (t === RemoteAppWindowType.Modal && w.parentWindowId)
            ) {
                children.push(w);
            } else {
                main.push(w);
            }
        }
        // Sort children so focused window renders last (highest z-order)
        children.sort((a, b) => {
            if (a.isFocused && !b.isFocused) return 1;
            if (!a.isFocused && b.isFocused) return -1;
            return 0;
        });
        return { mainWindows: main, childWindows: children };
    }, [windows]);

    // Auto-select first window
    useEffect(() => {
        if (mainWindows.length > 0 && !mainWindows.find((w) => w.id === selectedWindowId)) {
            setSelectedWindowId(mainWindows[0].id);
        }
    }, [mainWindows, selectedWindowId]);

    // Capture + actions for selected window
    const { uiState, isConnecting, error, startCapture, stopCapture } = useWindowCapture(
        selectedWindowId,
        deviceFingerprint,
    );
    const { dispatchAction } = useWindowActions(selectedWindowId, deviceFingerprint);

    // Resize remote window to fit mobile portrait screen, restore on leave
    const originalSizesRef = useRef<Map<string, { width: number; height: number }>>(new Map());
    const hasResizedRef = useRef<Set<string>>(new Set());
    const hasCorrectedRef = useRef<Set<string>>(new Set());
    const resizeTimestampRef = useRef<number>(0);

    useEffect(() => {
        if (!selectedWindowId || !deviceFingerprint) return;
        const win = mainWindows.find((w) => w.id === selectedWindowId);
        if (!win) return;

        // Only resize once per window per session
        if (hasResizedRef.current.has(selectedWindowId)) return;
        hasResizedRef.current.add(selectedWindowId);

        // Store original size for restoration on unmount
        originalSizesRef.current.set(selectedWindowId, { width: win.width, height: win.height });

        // Always attempt resize to our ideal portrait dimensions
        resizeTimestampRef.current = Date.now();
        (async () => {
            try {
                const sc = await getServiceController(deviceFingerprint);
                await sc.apps.performWindowAction({
                    action: RemoteAppWindowAction.Resize,
                    windowId: selectedWindowId,
                    newWidth: idealSize.width,
                    newHeight: idealSize.height,
                });
            } catch (e) {
                console.error('Failed to resize window:', e);
            }
        })();
    }, [selectedWindowId, mainWindows, idealSize, deviceFingerprint]);

    // Corrective resize: if the OS clamped width (app min width > our target),
    // increase height to maintain the phone's portrait aspect ratio.
    useEffect(() => {
        if (!selectedWindowId || !deviceFingerprint || !uiState) return;
        if (hasCorrectedRef.current.has(selectedWindowId)) return;

        // Only correct after initial resize has been attempted and
        // enough time has passed for the OS to process it
        if (!hasResizedRef.current.has(selectedWindowId)) return;
        if (Date.now() - resizeTimestampRef.current < 2000) return;

        const actualWidth = uiState.width;
        const actualHeight = uiState.height;

        // If the width was clamped wider than requested, compensate with more height
        if (actualWidth > idealSize.width * 1.05) {
            hasCorrectedRef.current.add(selectedWindowId);
            const correctedHeight = Math.round(actualWidth / idealSize.aspect);

            // Only resize if the height needs to increase significantly
            if (correctedHeight > actualHeight * 1.1) {
                (async () => {
                    try {
                        const sc = await getServiceController(deviceFingerprint);
                        await sc.apps.performWindowAction({
                            action: RemoteAppWindowAction.Resize,
                            windowId: selectedWindowId,
                            newWidth: actualWidth,
                            newHeight: correctedHeight,
                        });
                    } catch (e) {
                        console.error('Failed corrective resize:', e);
                    }
                })();
            }
        } else {
            // Width matched our request, no correction needed
            hasCorrectedRef.current.add(selectedWindowId);
        }
    }, [selectedWindowId, deviceFingerprint, uiState, idealSize]);

    // Restore original sizes on unmount
    useEffect(() => {
        const originals = originalSizesRef.current;
        const fp = deviceFingerprint;
        return () => {
            if (!fp || originals.size === 0) return;
            (async () => {
                try {
                    const sc = await getServiceController(fp);
                    for (const [windowId, size] of originals) {
                        await sc.apps.performWindowAction({
                            action: RemoteAppWindowAction.Resize,
                            windowId,
                            newWidth: size.width,
                            newHeight: size.height,
                        });
                    }
                } catch (e) {
                    console.error('Failed to restore window sizes:', e);
                }
            })();
        };
    }, [deviceFingerprint]);

    useEffect(() => {
        if (selectedWindowId) {
            startCapture();
            return () => stopCapture();
        }
    }, [selectedWindowId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Launch the app if not already running
    useEffect(() => {
        if (!appId || !deviceFingerprint) return;
        // We try launching - if it's already running this is usually a no-op
        (async () => {
            try {
                const sc = await getServiceController(deviceFingerprint);
                await sc.apps.launchApp(appId);
            } catch (e) {
                console.error('Failed to launch app:', e);
            }
        })();
    }, [appId, deviceFingerprint]);

    const toggleControlMode = useCallback(() => {
        setControlMode((prev) => (prev === 'pointer' ? 'touch' : 'pointer'));
    }, []);

    const handleCloseWindow = useCallback(() => {
        if (selectedWindowId) {
            dispatchAction({ action: RemoteAppWindowAction.Close });
        }
    }, [selectedWindowId, dispatchAction]);

    const [closedChildIds, setClosedChildIds] = useState<Set<string>>(new Set());

    const handleCloseChild = useCallback((windowId: string) => {
        setClosedChildIds((prev) => new Set(prev).add(windowId));
    }, []);

    // Reset closed children when windows list changes
    useEffect(() => {
        setClosedChildIds(new Set());
    }, [windows]);

    const visibleChildren = useMemo(() => {
        return childWindows.filter((w) => !closedChildIds.has(w.id));
    }, [childWindows, closedChildIds]);

    // Pause main window capture while child overlays are visible
    const hasVisibleChildren = visibleChildren.length > 0;
    useEffect(() => {
        if (!selectedWindowId) return;
        if (hasVisibleChildren) {
            stopCapture();
        } else {
            startCapture();
        }
    }, [hasVisibleChildren, selectedWindowId, startCapture, stopCapture]);

    return (
        <UIView themeColor="background" style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: appName || 'Screen Control',
                    headerTransparent: isGlassEnabled,
                    headerBackButtonDisplayMode: 'minimal',
                    gestureEnabled: controlMode !== 'pointer',
                }}
            />

            {/* Main content */}
            <View style={[styles.content, { paddingTop: isGlassEnabled ? insets.top + 44 : 0 }]}>
                {/* Canvas area */}
                <View style={[styles.canvasArea, { height: canvasAreaHeight }]}>
                    {isLoadingWindows && windows.length === 0 ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                Loading windows...
                            </UIText>
                        </View>
                    ) : mainWindows.length === 0 ? (
                        <View style={styles.centerContent}>
                            <UIIcon name="macwindow" size={36} themeColor="textSecondary" />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                No windows available
                            </UIText>
                            <UIButton
                                title="Go Back"
                                type="secondary"
                                size="sm"
                                style={{ marginTop: 16 }}
                                onPress={() => router.back()}
                            />
                        </View>
                    ) : isConnecting && !uiState ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                Connecting to window...
                            </UIText>
                        </View>
                    ) : error ? (
                        <View style={styles.centerContent}>
                            <UIIcon name="exclamationmark.triangle" size={32} themeColor="textSecondary" />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                {error}
                            </UIText>
                            <UIButton
                                title="Go Back"
                                type="secondary"
                                size="sm"
                                style={{ marginTop: 16 }}
                                onPress={() => router.back()}
                            />
                        </View>
                    ) : uiState ? (
                        <View style={styles.canvasWrapper}>
                            <WindowCanvas
                                uiState={uiState}
                                controlMode={controlMode}
                                touchSubMode={touchSubMode}
                                dispatchAction={dispatchAction}
                                canvasWidth={screenWidth - 16}
                                canvasHeight={canvasAreaHeight - 16}
                            />
                        </View>
                    ) : null}
                </View>

                {/* Window tabs */}
                <WindowTabBar
                    windows={mainWindows}
                    selectedWindowId={selectedWindowId}
                    onSelectWindow={setSelectedWindowId}
                />

                {/* Toolbar */}
                <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
                    <UIButton
                        icon={controlMode === 'pointer' ? 'cursorarrow' : 'hand.tap.fill'}
                        type="secondary"
                        size="sm"
                        onPress={toggleControlMode}
                        title={controlMode === 'pointer' ? 'Pointer' : 'Touch'}
                    />
                    {controlMode === 'touch' && (
                        <UIButton
                            type={touchSubMode === 'select' ? 'primary' : 'secondary'}
                            size="sm"
                            onPress={() => setTouchSubMode((m) => m === 'scroll' ? 'select' : 'scroll')}
                            title="Select"
                        />
                    )}
                    <UIButton
                        icon="keyboard.fill"
                        type={showKeyboard ? 'primary' : 'secondary'}
                        size="sm"
                        onPress={() => setShowKeyboard((v) => !v)}
                    />
                    <UIButton
                        icon="xmark"
                        type="secondary"
                        size="sm"
                        onPress={handleCloseWindow}
                    />
                </View>
            </View>

            {/* Keyboard */}
            <KeyboardInput
                visible={showKeyboard}
                onClose={() => setShowKeyboard(false)}
                dispatchAction={dispatchAction}
            />

            {/* Child window modals */}
            {visibleChildren.map((child) => (
                <ChildWindowModal
                    key={child.id}
                    window={child}
                    deviceFingerprint={deviceFingerprint}
                    onClose={() => handleCloseChild(child.id)}
                />
            ))}
        </UIView>
    );
}

// ── Styles ──

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    canvasArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    canvasWrapper: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
    },
    canvasContainer: {
        overflow: 'hidden',
        backgroundColor: '#000',
        borderRadius: 4,
    },
    pointerCursor: {
        position: 'absolute',
        zIndex: 100,
        shadowColor: '#000',
        shadowOffset: { width: 1, height: 1 },
        shadowOpacity: 0.8,
        shadowRadius: 2,
        elevation: 5,
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    tabBar: {
        maxHeight: 40,
    },
    tabBarContent: {
        paddingHorizontal: 16,
        gap: 4,
        alignItems: 'center',
    },
    tabItem: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    keyboardContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    keyboardBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    keyboardInputWrapper: {
        flex: 1,
        borderRadius: 20,
        paddingHorizontal: 12,
        marginRight: 8,
    },
    keyboardInput: {
        height: 36,
        color: '#fff',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#1a1a1a',
    },
    modalLoading: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
    },
});
