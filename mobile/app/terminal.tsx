import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    ActivityIndicator,
    Pressable,
    Text,
    Platform,
    Keyboard,
    Appearance,
    ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UIText } from '@/components/ui/UIText';
import { getServiceController, isGlassEnabled } from '@/lib/utils';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '@/hooks/useAppState';
import { useAutoConnect } from '@/hooks/useAutoConnect';
import { UIButton } from '@/components/ui/UIButton';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from '@react-navigation/native';
import { useNavigationTheme } from '@/hooks/useNavigationTheme';
import { useAssets } from 'expo-asset';
import * as Clipboard from 'expo-clipboard';

const terminalHtmlModule = require('@/assets/terminal.html');

const SPECIAL_KEYS: { label: string; key: string }[] = [
    { label: 'Esc', key: '\x1b' },
    { label: 'Tab', key: '\t' },
    { label: 'Ctrl', key: 'CTRL' },
    { label: 'Alt', key: 'ALT' },
    { label: 'Shift', key: 'SHIFT' },
    { label: '\u2191', key: '\x1b[A' },
    { label: '\u2193', key: '\x1b[B' },
    { label: '\u2190', key: '\x1b[D' },
    { label: '\u2192', key: '\x1b[C' },
    { label: 'PgUp', key: '\x1b[5~' },
    { label: 'PgDn', key: '\x1b[6~' },
    { label: 'Home', key: '\x1b[H' },
    { label: 'End', key: '\x1b[F' },
];

function TerminalKeybar({ onKey, ctrlActive, altActive, shiftActive, onToggleCtrl, onToggleAlt, onToggleShift }: {
    onKey: (key: string) => void;
    ctrlActive: boolean;
    altActive: boolean;
    shiftActive: boolean;
    onToggleCtrl: () => void;
    onToggleAlt: () => void;
    onToggleShift: () => void;
}) {
    const handlePress = useCallback((item: typeof SPECIAL_KEYS[number]) => {
        if (item.key === 'CTRL') {
            onToggleCtrl();
            return;
        }
        if (item.key === 'ALT') {
            onToggleAlt();
            return;
        }
        if (item.key === 'SHIFT') {
            onToggleShift();
            return;
        }
        onKey(item.key);
    }, [onKey, onToggleCtrl, onToggleAlt, onToggleShift]);

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={styles.keybar}
            style={styles.keybarScroll}
        >
            {SPECIAL_KEYS.map((item) => {
                const isActive = (item.key === 'CTRL' && ctrlActive) || (item.key === 'ALT' && altActive) || (item.key === 'SHIFT' && shiftActive);
                return (
                    <Pressable
                        key={item.label}
                        style={[styles.keyButton, isActive && styles.keyButtonActive]}
                        onPress={() => handlePress(item)}
                    >
                        <Text style={[styles.keyLabel, isActive && styles.keyLabelActive]}>{item.label}</Text>
                    </Pressable>
                );
            })}
        </ScrollView>
    );
}

export default function TerminalScreen() {
    const { fingerprint } = useLocalSearchParams<{ fingerprint: string }>();
    const deviceFingerprint = fingerprint === 'local' || !fingerprint ? null : fingerprint;
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { peers } = useAppState();

    const darkTheme = useNavigationTheme({ forceDark: true });

    useAutoConnect(deviceFingerprint, 'terminal');

    const handleClose = useCallback(() => {
        Keyboard.dismiss();
        router.back();
    }, [router]);

    const deviceName = useMemo(() => {
        if (!deviceFingerprint) return 'Local Terminal';
        const peer = peers.find(p => p.fingerprint === deviceFingerprint);
        return peer?.deviceName || 'Terminal';
    }, [deviceFingerprint, peers]);

    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ctrlActive, setCtrlActive] = useState(false);
    const [altActive, setAltActive] = useState(false);
    const [shiftActive, setShiftActive] = useState(false);
    const [selectionActive, setSelectionActive] = useState(false);
    const [selectionText, setSelectionText] = useState('');

    const ctrlRef = useRef(false);
    const altRef = useRef(false);
    const shiftRef = useRef(false);

    const toggleCtrl = useCallback(() => {
        setCtrlActive(prev => {
            ctrlRef.current = !prev;
            return !prev;
        });
    }, []);

    const toggleAlt = useCallback(() => {
        setAltActive(prev => {
            altRef.current = !prev;
            return !prev;
        });
    }, []);

    const toggleShift = useCallback(() => {
        setShiftActive(prev => {
            shiftRef.current = !prev;
            return !prev;
        });
    }, []);

    const clearModifiers = useCallback(() => {
        ctrlRef.current = false;
        altRef.current = false;
        shiftRef.current = false;
        setCtrlActive(false);
        setAltActive(false);
        setShiftActive(false);
    }, []);

    const [assets] = useAssets([terminalHtmlModule]);
    const terminalSource = useMemo(() =>
        assets?.[0]?.localUri ? { uri: assets[0].localUri } : null,
        [assets]
    );

    const sessionIdRef = useRef<string | null>(null);
    const isMountedRef = useRef(true);
    const webViewRef = useRef<WebView>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const fingerprintRef = useRef(deviceFingerprint);
    const lastDimsRef = useRef<{ cols: number; rows: number }>({ cols: 80, rows: 24 });
    fingerprintRef.current = deviceFingerprint;

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    // Force dark keyboard appearance — delay until after modal transition
    // to avoid flashing the previous screen into dark mode during animation
    useEffect(() => {
        const prev = Appearance.getColorScheme();
        const timer = setTimeout(() => {
            Appearance.setColorScheme('dark');
        }, 500);
        return () => {
            clearTimeout(timer);
            Appearance.setColorScheme(prev ?? null);
        };
    }, []);

    // Handle messages from WebView (xterm.js)
    const connectTerminal = useCallback(async (cols: number, rows: number) => {
        if (!deviceFingerprint) return;
        lastDimsRef.current = { cols, rows };
        setIsConnecting(true);
        setError(null);

        try {
            const sc = await getServiceController(deviceFingerprint);
            if (!isMountedRef.current) return;

            const session = await sc.terminal.startTerminalSession();
            if (!isMountedRef.current) return;

            sessionIdRef.current = session.sessionId;

            // Resize to match WebView terminal dimensions
            if (cols && rows) {
                await sc.terminal.resizeTerminal(session.sessionId, cols, rows);
            }

            setIsConnecting(false);

            // Focus the xterm textarea to bring up the keyboard
            // Delay to avoid competing with screen transition animation
            setTimeout(() => {
                webViewRef.current?.injectJavaScript(
                    `document.querySelector('.xterm-helper-textarea')?.focus(); true;`
                );
            }, 400);

            // Read output stream and forward to WebView
            const reader = session.stream.getReader();
            readerRef.current = reader;
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done || !isMountedRef.current) break;

                const text = decoder.decode(value);
                // Send output to WebView xterm.js
                const escaped = JSON.stringify(text);
                webViewRef.current?.injectJavaScript(
                    `window.postMessage(JSON.stringify({type:'output',data:${escaped}}), '*'); true;`
                );
            }

            sessionIdRef.current = null;
            readerRef.current = null;

            if (isMountedRef.current) {
                setError('Terminal session ended.');
            }
        } catch (e: any) {
            sessionIdRef.current = null;
            readerRef.current = null;
            if (!isMountedRef.current) return;
            console.error('[Terminal] Error:', e);
            setError(e?.message || 'Failed to connect.');
        }
    }, [deviceFingerprint]);

    const onWebViewMessage = useCallback(async (event: WebViewMessageEvent) => {
        try {
            const msg = JSON.parse(event.nativeEvent.data);

            if (msg.type === 'ready') {
                // WebView is ready — start terminal session
                connectTerminal(msg.cols, msg.rows);
            } else if (msg.type === 'input') {
                // User typed in xterm → apply modifiers and send to server
                if (sessionIdRef.current) {
                    let data: string = msg.data;
                    if (data.length === 1) {
                        if (ctrlRef.current) {
                            const code = data.toLowerCase().charCodeAt(0);
                            if (code >= 97 && code <= 122) data = String.fromCharCode(code - 96);
                        }
                        if (altRef.current) data = '\x1b' + data;
                    }
                    if (ctrlRef.current || altRef.current || shiftRef.current) clearModifiers();
                    const sc = await getServiceController(fingerprintRef.current);
                    await sc.terminal.writeTerminal(sessionIdRef.current, data);
                }
            } else if (msg.type === 'resize') {
                // Terminal resized → tell server
                if (sessionIdRef.current) {
                    const sc = await getServiceController(fingerprintRef.current);
                    await sc.terminal.resizeTerminal(sessionIdRef.current, msg.cols, msg.rows);
                }
            } else if (msg.type === 'selectionStart') {
                setSelectionActive(true);
                setSelectionText('');
            } else if (msg.type === 'selection') {
                setSelectionText(typeof msg.text === 'string' ? msg.text : '');
            } else if (msg.type === 'selectionEnd') {
                setSelectionActive(false);
                setSelectionText('');
            }
        } catch (e) {
            console.error('[Terminal] WebView message error:', e);
        }
    }, [connectTerminal, clearModifiers]);

    const sendKey = useCallback(async (key: string) => {
        if (sessionIdRef.current) {
            let data = key;
            const hasModifier = shiftRef.current || altRef.current || ctrlRef.current;

            if (hasModifier) {
                const mod = 1 + (shiftRef.current ? 1 : 0) | (altRef.current ? 2 : 0) | (ctrlRef.current ? 4 : 0);

                // Arrow keys: \x1b[X → \x1b[1;{mod}X
                const arrowMatch = key.match(/^\x1b\[([ABCD])$/);
                if (arrowMatch) {
                    data = `\x1b[1;${mod}${arrowMatch[1]}`;
                } else if (key === '\t' && shiftRef.current) {
                    data = '\x1b[Z';
                }

                clearModifiers();
            }

            const sc = await getServiceController(fingerprintRef.current);
            await sc.terminal.writeTerminal(sessionIdRef.current, data);
        }
        // Refocus terminal to keep keyboard open
        webViewRef.current?.injectJavaScript(
            `document.querySelector('.xterm-helper-textarea')?.focus(); true;`
        );
    }, [clearModifiers]);

    const exitSelection = useCallback(() => {
        webViewRef.current?.injectJavaScript(
            `window.postMessage(JSON.stringify({type:'exitSelection'}), '*'); true;`
        );
        setSelectionActive(false);
        setSelectionText('');
    }, []);

    const copySelection = useCallback(async () => {
        if (selectionText) {
            try { await Clipboard.setStringAsync(selectionText); } catch (err) {
                console.error('Clipboard error in terminal:', err);
            }
        }
        exitSelection();
    }, [selectionText, exitSelection]);

    const reconnect = useCallback(() => {
        // Clean up previous session
        if (readerRef.current) {
            readerRef.current.cancel().catch((err) => {
                console.error('Error cancelling reader:', err);
            });
            readerRef.current = null;
        }
        if (sessionIdRef.current) {
            getServiceController(fingerprintRef.current)
                .then(sc => sc.terminal.stopTerminalSession(sessionIdRef.current!))
                .catch((err) => {
                    console.error('Error stopping terminal session:', err);
                });
            sessionIdRef.current = null;
        }
        // Clear xterm and reconnect
        webViewRef.current?.injectJavaScript(
            `window.postMessage(JSON.stringify({type:'clear'}), '*'); true;`
        );
        setError(null);
        connectTerminal(lastDimsRef.current.cols, lastDimsRef.current.rows);
    }, [connectTerminal]);

    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const KEYBAR_HEIGHT = 40;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const showSub = Keyboard.addListener(showEvent, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const hideSub = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    // Re-fit xterm when keyboard height changes (container size changes).
    // Android WebView layout settles slowly, so fit twice with delay.
    useEffect(() => {
        const fitCmd = `if(window._fitAddon){window._fitAddon.fit();} true;`;
        const t1 = setTimeout(() => { webViewRef.current?.injectJavaScript(fitCmd); }, 150);
        const t2 = setTimeout(() => { webViewRef.current?.injectJavaScript(fitCmd); }, 500);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [keyboardHeight]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (readerRef.current) {
                readerRef.current.cancel().catch((err) => {
                    console.error('Error cancelling reader:', err);
                });
            }
            if (sessionIdRef.current) {
                getServiceController(fingerprintRef.current)
                    .then(sc => sc.terminal.stopTerminalSession(sessionIdRef.current!))
                    .catch((err) => {
                        console.error('Error stopping terminal session:', err);
                    });
            }
        };
    }, []);

    return (
        <ThemeProvider value={darkTheme}>
            <View style={[styles.root, { paddingTop: insets.top }]}>
                <StatusBar style="light" />

                {/* Custom dark header */}
                <View style={styles.header}>
                    <View style={{ zIndex: 2 }}>
                        <UIButton type="secondary" icon="xmark" iconSize={20} onPress={handleClose} />
                    </View>
                    <View pointerEvents="none" style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle} numberOfLines={1}>{deviceName}</Text>
                    </View>
                </View>

                <View style={[styles.container, keyboardHeight > 0 && { marginBottom: keyboardHeight + KEYBAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0) }]}>
                    {isConnecting && (
                        <View style={styles.overlay}>
                            <ActivityIndicator color="#fff" />
                            <UIText color="textSecondary" size="sm" style={{ marginTop: 8 }}>
                                Connecting...
                            </UIText>
                        </View>
                    )}
                    {error && (
                        <View style={styles.overlay}>
                            <UIText color="textSecondary" size="sm">{error}</UIText>
                            <UIButton
                                type="secondary"
                                title={sessionIdRef.current ? 'New Session' : 'Reconnect'}
                                size="sm"
                                onPress={reconnect}
                                style={{ marginTop: 16 }}
                            />
                        </View>
                    )}
                    {terminalSource && <WebView
                        ref={webViewRef}
                        source={terminalSource}
                        style={styles.webview}
                        originWhitelist={['*']}
                        allowFileAccess
                        javaScriptEnabled
                        domStorageEnabled
                        onMessage={onWebViewMessage}
                        scrollEnabled={false}
                        bounces={false}
                        keyboardDisplayRequiresUserAction={false}
                        hideKeyboardAccessoryView
                        autoManageStatusBarEnabled={false}
                    />}
                </View>
                <View style={[styles.keybarContainer, { bottom: keyboardHeight + (Platform.OS === 'android' ? insets.bottom : 0) }]}>
                    {selectionActive && (
                        <View style={styles.selectionBar}>
                            <Text style={styles.selectionInfo} numberOfLines={1}>
                                {selectionText ? `${selectionText.length} char${selectionText.length === 1 ? '' : 's'} selected` : 'Tap a word'}
                            </Text>
                            <View style={styles.selectionButtons}>
                                <Pressable style={styles.selectionBtn} onPress={exitSelection}>
                                    <Text style={styles.selectionBtnText}>Cancel</Text>
                                </Pressable>
                                <Pressable
                                    style={[styles.selectionBtn, styles.selectionBtnPrimary, !selectionText && styles.selectionBtnDisabled]}
                                    onPress={copySelection}
                                    disabled={!selectionText}
                                >
                                    <Text style={[styles.selectionBtnText, styles.selectionBtnTextPrimary]}>Copy</Text>
                                </Pressable>
                            </View>
                        </View>
                    )}
                    <TerminalKeybar
                        onKey={sendKey}
                        ctrlActive={ctrlActive}
                        altActive={altActive}
                        shiftActive={shiftActive}
                        onToggleCtrl={toggleCtrl}
                        onToggleAlt={toggleAlt}
                        onToggleShift={toggleShift}
                    />
                </View>
            </View>
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Platform.OS === 'android' ? 56 : 44,
        paddingHorizontal: 8,
        backgroundColor: '#000',
        zIndex: 10,
    },
    headerTitleWrap: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    webview: {
        flex: 1,
        backgroundColor: '#000',
    },
    keybar: {
        flexDirection: 'row',
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    keybarScroll: {
        backgroundColor: isGlassEnabled ? 'transparent' : '#2d2d2d',
        borderTopWidth: isGlassEnabled ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: '#444',
    },
    keybarContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
    },
    keyButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginHorizontal: 2,
        borderRadius: 6,
        backgroundColor: isGlassEnabled ? 'rgba(255,255,255,0.1)' : '#3a3a3a',
    },
    keyButtonActive: {
        backgroundColor: isGlassEnabled ? 'rgba(255,255,255,0.25)' : '#666',
    },
    keyLabel: {
        color: '#ddd',
        fontSize: 13,
        fontWeight: '500',
    },
    keyLabelActive: {
        color: '#fff',
    },
    selectionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: 'transparent',
    },
    selectionInfo: {
        color: '#aaa',
        fontSize: 13,
        flex: 1,
    },
    selectionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    selectionBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: '#3a3a3a',
    },
    selectionBtnPrimary: {
        backgroundColor: '#0a84ff',
    },
    selectionBtnDisabled: {
        opacity: 0.4,
    },
    selectionBtnText: {
        color: '#ddd',
        fontSize: 13,
        fontWeight: '500',
    },
    selectionBtnTextPrimary: {
        color: '#fff',
    },
});
