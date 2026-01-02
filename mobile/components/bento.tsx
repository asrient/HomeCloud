import { StyleSheet, ViewStyle, Pressable, Animated, Dimensions, Modal, View, StyleProp } from "react-native";
import { BlurView } from "expo-blur";
import { UIView } from "./ui/UIView";
import { UIText } from "./ui/UIText";
import { UIIcon, IconSymbolName } from "./ui/UIIcon";
import { useState, useRef } from "react";


const HEIGHT_UNIT = 90;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type BentoBoxType = 'half' | 'full' | 'small';

export type BentoBoxConfig = {
    type: BentoBoxType;
    icon?: IconSymbolName;
    title?: string;
    subtitle?: string;
    onPress?: () => void;
    content?: React.ReactNode;
    canExpand?: boolean;
    expandedContent?: () => React.ReactNode;
    isCircular?: boolean;
    expandedContentHeight?: number;
};

export type BentoGroup = {
    flow: 'row' | 'column';
    boxes: (BentoBoxConfig | BentoGroup)[];
};

function BentoBox({ config }: { config: BentoBoxConfig }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handlePressIn = () => {
        // Scale down animation on press
        Animated.spring(scaleAnim, {
            toValue: 0.95,
            useNativeDriver: true,
        }).start();

        // Start long press timer if canExpand is true
        if (config.canExpand && config.expandedContent) {
            longPressTimer.current = setTimeout(() => {
                setIsExpanded(true);
            }, 500); // 500ms for long press
        }
    };

    const handlePressOut = () => {
        // Scale back to normal
        Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
        }).start();

        // Clear long press timer
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handlePress = () => {
        if (config.onPress) {
            config.onPress();
        }
    };

    const handleCloseExpanded = () => {
        setIsExpanded(false);
    };

    const getBoxShape = (): ViewStyle => {
        switch (config.type) {
            case 'half':
                return styles.bentoBoxHalf;
            case 'full':
                return styles.bentoBoxFull;
            case 'small':
                return styles.bentoBoxSmall;
            default:
                return styles.bentoBoxHalf;
        }
    };

    const getBoxStyle = (): StyleProp<ViewStyle> => {
        const baseStyle = getBoxShape();
        const extraStyle: ViewStyle = {};
        if (config.isCircular && config.type === 'small') {
            extraStyle.borderRadius = 1000; // Large value for circular shape
            extraStyle.aspectRatio = 1; // Keep it square
            extraStyle.height = 'auto'; // Let height be determined by width
        }
        return StyleSheet.compose(baseStyle, extraStyle);
    };

    return (
        <>
            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Pressable
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={handlePress}
                >
                    <UIView themeColor='backgroundSecondary' useGlass style={getBoxStyle()}>
                        <View style={{
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: config.type === 'full' ? 'column' : 'row',
                            gap: 10
                        }}>
                            {config.icon && (
                                <UIIcon name={config.icon} size={config.type === 'small' ? 22 : 26} themeColor="icon" />
                            )}
                            {config.type !== 'small' && <View style={{
                                alignItems: config.type === 'full' ? 'center' : 'flex-start',
                                justifyContent: 'center'
                            }}>
                                {config.title && (
                                    <UIText size='md'>{config.title}</UIText>
                                )}
                                {config.subtitle && (
                                    <UIText color='textSecondary' size='xs'>{config.subtitle}</UIText>
                                )}
                            </View>}
                        </View>
                        {config.content}
                    </UIView>
                </Pressable>
            </Animated.View>

            {/* Expanded Modal */}
            {isExpanded && config.expandedContent && (
                <Modal
                    visible={isExpanded}
                    transparent
                    animationType="fade"
                    onRequestClose={handleCloseExpanded}
                >
                    <BlurView intensity={80} style={styles.modalOverlay} tint="dark">
                        <Pressable
                            style={styles.modalOverlay}
                            onPress={handleCloseExpanded}
                        >
                            <Pressable
                                style={[styles.expandedBox, config.expandedContentHeight ? { height: config.expandedContentHeight } : {}]}
                                onPress={(e) => e.stopPropagation()}
                            >
                                <UIView themeColor='backgroundSecondary' useGlass style={styles.expandedContent}>
                                    {config.expandedContent()}
                                </UIView>
                            </Pressable>
                        </Pressable>
                    </BlurView>
                </Modal>
            )}
        </>
    );
}

function renderBentoGroup(group: BentoGroup, key: number): React.ReactNode {
    const isRow = group.flow === 'row';
    const itemCount = group.boxes.length;
    return (
        <View
            key={key}
            style={[isRow ? styles.bentoRow : styles.bentoColumn, { maxWidth: 400 }]}
        >
            {group.boxes.map((item, index) => {
                const isBox = 'type' in item;
                const style: ViewStyle = isRow ?
                    { flex: 1 / itemCount } :
                    { flex: 1 };
                return (<View
                    key={index}
                    style={style}>
                    {
                        isBox ? (
                            <BentoBox key={index} config={item as BentoBoxConfig} />
                        ) : (
                            renderBentoGroup(item as BentoGroup, index)
                        )
                    }
                </View>
                )
            })}
        </View>
    );
}

export function Bento({ config }: { config: BentoGroup[] }) {
    return (
        <UIView style={styles.container}>
            {config.map((group, index) => renderBentoGroup(group, index))}
        </UIView>
    );
}

const commonBoxStyle: ViewStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 5,
    borderRadius: 40,
    margin: 4,
    flex: 1,
    overflow: 'hidden',
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexWrap: 'wrap',
        flexDirection: 'row',
        justifyContent: 'center',
    },
    bentoRow: {
        flexDirection: 'row',
        width: '100%',
    },
    bentoColumn: {
        flexDirection: 'column',
        width: '100%',
    },
    // Half width, 1 unit height
    bentoBoxHalf: {
        height: HEIGHT_UNIT,
        ...commonBoxStyle,
    },
    // Full width, 2 unit height
    bentoBoxFull: {
        height: HEIGHT_UNIT * 2 + 8,
        ...commonBoxStyle,
    },
    // Small box - 1/4 width, 1 unit height
    bentoBoxSmall: {
        height: HEIGHT_UNIT,
        ...commonBoxStyle,
    },
    // Expanded Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    expandedBox: {
        width: SCREEN_WIDTH * 0.9,
        height: SCREEN_HEIGHT * 0.7,
        maxHeight: 500,
        alignItems: 'center',
    },
    expandedContent: {
        flex: 1,
        width: '100%',
        borderRadius: 40,
        padding: 5,
    },
});
