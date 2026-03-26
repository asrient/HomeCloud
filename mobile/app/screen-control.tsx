import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    TextInput,
    Platform,
    Keyboard,
    GestureResponderEvent,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UIText } from '@/components/ui/UIText';
import { UIButton } from '@/components/ui/UIButton';
import { UIView } from '@/components/ui/UIView';
import { UIIcon } from '@/components/ui/UIIcon';
import { useScreenCapture, useScreenActions } from '@/hooks/useApps';
import { useAppState } from '@/hooks/useAppState';
import {
    RemoteAppWindowAction,
} from 'shared/types';
import { isGlassEnabled } from '@/lib/utils';
import { useAutoConnect } from '@/hooks/useAutoConnect';
import { H264PlayerView } from '@/modules/h264-player';
import { UIHeaderButton } from '@/components/ui/UIHeaderButton';

// ── Constants ──

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const POINTER_MOVE_SENSITIVITY = 1.5;

type ControlMode = 'pointer' | 'touch';
type TouchSubMode = 'scroll' | 'select';

// ── Window Canvas ──

function WindowCanvas({
    frameState,
    sessionId,
    controlMode,
    touchSubMode,
    dispatchAction,
    canvasWidth,
    canvasHeight,
    rotated,
}: {
    frameState: { width: number; height: number; dpi: number };
    sessionId: string | null;
    controlMode: ControlMode;
    touchSubMode: TouchSubMode;
    dispatchAction: (payload: any) => void;
    canvasWidth: number;
    canvasHeight: number;
    rotated: boolean;
}) {
    // Use logical (point) dimensions for layout and input mapping
    const dpi = frameState.dpi || 1;
    const logicalWidth = frameState.width / dpi;
    const logicalHeight = frameState.height / dpi;

    // Scale factor: fit remote window (logical) into canvasWidth/canvasHeight
    const scale = useMemo(() => {
        const sx = canvasWidth / logicalWidth;
        const sy = canvasHeight / logicalHeight;
        return Math.min(sx, sy, 1);
    }, [logicalWidth, logicalHeight, canvasWidth, canvasHeight]);

    const displayWidth = logicalWidth * scale;
    const displayHeight = logicalHeight * scale;

    // Pointer mode state — in logical coordinates
    const pointerPos = useRef<{ x: number; y: number }>({
        x: logicalWidth / 2,
        y: logicalHeight / 2,
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
    // When the parent is rotated 90° CW, screen coords map differently:
    //   screen X → view local Y (inverted), screen Y → view local X
    const touchToWindowCoords = useCallback(
        (pageX: number, pageY: number, viewLayout: { x: number; y: number }) => {
            const relX = pageX - viewLayout.x;
            const relY = pageY - viewLayout.y;
            if (rotated) {
                return {
                    x: Math.round(relY / scale),
                    y: Math.round((displayHeight - relX) / scale),
                };
            }
            return {
                x: Math.round(relX / scale),
                y: Math.round(relY / scale),
            };
        },
        [scale, rotated, displayHeight],
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
                    const rawDx = pageX - lastScrollPosRef.current.x;
                    const rawDy = pageY - lastScrollPosRef.current.y;
                    const sdx = Math.round((rotated ? rawDy : rawDx) / 3);
                    const sdy = Math.round((rotated ? -rawDx : rawDy) / 3);
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
                    const rawDx = pageX - touchStartRef.current.x;
                    const rawDy = pageY - touchStartRef.current.y;
                    // When rotated 90° CW: screen X → local -Y, screen Y → local +X
                    const dx = (rotated ? rawDy : rawDx) * POINTER_MOVE_SENSITIVITY;
                    const dy = (rotated ? -rawDx : rawDy) * POINTER_MOVE_SENSITIVITY;

                    if (!isDraggingRef.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                        isDraggingRef.current = true;
                    }

                    if (isDraggingRef.current) {
                        const newX = Math.max(0, Math.min(logicalWidth, pointerPos.current.x + dx));
                        const newY = Math.max(0, Math.min(logicalHeight, pointerPos.current.y + dy));
                        pointerPos.current = { x: newX, y: newY };
                        setPointerDisplay({
                            x: newX / logicalWidth,
                            y: newY / logicalHeight,
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
                    const rawDx2 = pageX - lastScrollPosRef.current.x;
                    const rawDy2 = pageY - lastScrollPosRef.current.y;
                    const sdx = Math.round((rotated ? rawDy2 : rawDx2) / 3);
                    const sdy = Math.round((rotated ? -rawDx2 : rawDy2) / 3);
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
        [controlMode, touchSubMode, dispatchAction, touchToWindowCoords, logicalWidth, logicalHeight, rotated],
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
            {sessionId && (
                <H264PlayerView
                    sessionId={sessionId}
                    style={StyleSheet.absoluteFill}
                />
            )}

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
                    <UIIcon
                        name="pointer.arrow.ipad"
                        size={14}
                        color='#fff'
                    />
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
    const [kbHeight, setKbHeight] = useState(0);

    useEffect(() => {
        if (visible) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            inputRef.current?.blur();
        }
    }, [visible]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (e) => setKbHeight(e.endCoordinates.height));
        const hideSub = Keyboard.addListener(hideEvent, () => setKbHeight(0));
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

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

    return (
        <>
            {/* Hidden TextInput positioned off-screen so Android's adjustPan
                doesn't pan the window when it gets focus */}
            <TextInput
                ref={inputRef}
                style={styles.hiddenInput}
                value={text}
                onChangeText={handleTextChange}
                onKeyPress={handleKeyPress}
                autoCapitalize="none"
                autoCorrect={false}
                blurOnSubmit={false}
                onSubmitEditing={() => {
                    dispatchAction({ action: RemoteAppWindowAction.KeyInput, key: 'Return' });
                }}
            />
            {/* iOS has no system keyboard dismiss button, so show a close button */}
            {visible && kbHeight > 0 && Platform.OS === 'ios' && (
                <View style={[styles.keyboardContainer, { bottom: kbHeight }]}>
                    <View style={styles.keyboardCloseBar}>
                        <View style={{ flex: 1 }} />
                        <UIButton title='Hide' type="secondary" onPress={onClose} />
                    </View>
                </View>
            )}
        </>
    );
}

// ── Window Tab Bar — REMOVED (now streaming full screen) ──

// ── Main Screen Control Page ──

export default function ScreenControlScreen() {
    const router = useRouter();
    const { fingerprint } = useLocalSearchParams<{
        fingerprint: string;
    }>();
    const insets = useSafeAreaInsets();
    const deviceFingerprint = fingerprint === 'local' || !fingerprint ? null : fingerprint;

    useAutoConnect(deviceFingerprint, 'screen-control');

    const { peers } = useAppState();
    const deviceName = useMemo(() => {
        if (!deviceFingerprint) return 'Screen Control';
        const peer = peers.find(p => p.fingerprint === deviceFingerprint);
        return peer?.deviceName || 'Screen Control';
    }, [deviceFingerprint, peers]);

    const [controlMode, setControlMode] = useState<ControlMode>('touch');
    const [touchSubMode, setTouchSubMode] = useState<TouchSubMode>('scroll');
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [rotated, setRotated] = useState(false);

    const screenWidth = Dimensions.get('window').width;
    const screenHeight = Dimensions.get('window').height;
    const canvasAreaHeight = screenHeight - insets.top - insets.bottom - 120;

    // When rotated, the canvas container is rotated 90° so swap width/height for layout
    const effectiveCanvasWidth = rotated ? canvasAreaHeight - 16 : screenWidth - 16;
    const effectiveCanvasHeight = rotated ? screenWidth - 16 : canvasAreaHeight - 16;

    // Full-screen capture
    const { sessionId, frameState, isConnecting, error, startCapture, stopCapture, isReconnecting, retryAttempt, cancelReconnect } = useScreenCapture(
        deviceFingerprint,
    );
    const { dispatchAction } = useScreenActions(deviceFingerprint);

    const toggleControlMode = useCallback(() => {
        setControlMode((prev) => (prev === 'pointer' ? 'touch' : 'pointer'));
    }, []);

    // Start/stop capture
    useEffect(() => {
        if (deviceFingerprint !== undefined) {
            startCapture();
            return () => stopCapture();
        }
    }, [deviceFingerprint]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <UIView themeColor="background" style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: deviceName,
                    headerTransparent: isGlassEnabled,
                    headerBackButtonDisplayMode: 'minimal',
                    gestureEnabled: controlMode !== 'pointer',
                    headerLeft: () => (
                        <UIHeaderButton name="xmark" onPress={() => router.back()} />
                    ),
                    headerRight: () => (
                        <UIHeaderButton
                            name="rotate.right"
                            onPress={() => setRotated((r) => !r)}
                            isHighlight={rotated}
                        />
                    ),
                    headerBackVisible: false,
                }}
            />

            {/* Main content */}
            <View style={[styles.content, { paddingTop: isGlassEnabled ? insets.top + 44 : 0 }]}>
                {/* Canvas area */}
                <View style={[styles.canvasArea, { height: canvasAreaHeight }]}>
                    {isConnecting && !frameState ? (
                        <View style={styles.centerContent}>
                            <ActivityIndicator />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                Connecting to screen...
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
                    ) : frameState ? (
                        <View style={[
                            styles.canvasWrapper,
                            rotated && {
                                transform: [{ rotate: '90deg' }],
                                width: canvasAreaHeight,
                                height: screenWidth,
                            },
                        ]}>
                            <WindowCanvas
                                frameState={frameState}
                                sessionId={sessionId}
                                controlMode={controlMode}
                                touchSubMode={touchSubMode}
                                dispatchAction={dispatchAction}
                                canvasWidth={effectiveCanvasWidth}
                                canvasHeight={effectiveCanvasHeight}
                                rotated={rotated}
                            />
                            {isReconnecting && (
                                <View style={styles.reconnectOverlay}>
                                    <ActivityIndicator color="#fff" />
                                    <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                        Reconnecting (attempt {retryAttempt})...
                                    </UIText>
                                    <UIButton
                                        title="Cancel"
                                        type="secondary"
                                        size="sm"
                                        style={{ marginTop: 12 }}
                                        onPress={cancelReconnect}
                                    />
                                </View>
                            )}
                        </View>
                    ) : null}
                </View>

                {/* Toolbar */}
                <View style={[styles.toolbar, { paddingBottom: insets.bottom + 8 }]}>
                    <UIButton
                        icon={'pointer.arrow.ipad'}
                        type={controlMode === 'pointer' ? 'primary' : 'secondary'}
                        onPress={toggleControlMode}
                    />
                    <UIButton
                        disabled={controlMode !== 'touch'}
                        icon='selection.pin.in.out'
                        type={touchSubMode === 'select' ? 'primary' : 'secondary'}
                        onPress={() => setTouchSubMode((m) => m === 'scroll' ? 'select' : 'scroll')}
                    />
                    <UIButton
                        icon="keyboard.fill"
                        type={'secondary'}
                        onPress={() => setShowKeyboard((v) => !v)}
                    />
                </View>
            </View>

            {/* Keyboard */}
            <KeyboardInput
                visible={showKeyboard}
                onClose={() => setShowKeyboard(false)}
                dispatchAction={dispatchAction}
            />
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
    keyboardContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
    keyboardCloseBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    hiddenInput: {
        position: 'absolute',
        opacity: 0,
        height: 0,
        width: 0,
    },
    reconnectOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
});
