import { Modal, View, StyleSheet, Platform } from 'react-native';
import { UIView } from './UIView';
import { UIStatusBar } from './UIStatusBar';
import { UIText } from './UIText';
import { UIButton } from './UIButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/useThemeColor';

const isIos = Platform.OS === 'ios';
const buttonType = isIos ? 'secondary' : 'link';

export type UIPageSheetProps = {
    isOpen: boolean;
    onClose: () => void;
    title?: string | React.ReactNode;
    children: React.ReactNode;
    showBackButton?: boolean;
    onBack?: () => void;
    headerButtons?: React.ReactNode;
};

export function UIPageSheet({
    isOpen,
    onClose,
    title,
    children,
    showBackButton = false,
    onBack,
    headerButtons,
}: UIPageSheetProps) {
    const insets = useSafeAreaInsets();
    const separatorColor = useThemeColor({}, 'seperator');

    // On Android, pageSheet doesn't respect status bar, so we add padding
    const topPadding = isIos ? 0 : insets.top;

    // If headerButtons are provided, close button goes left; otherwise it goes right
    const hasHeaderButtons = !!headerButtons;

    const closeButton = (
        <UIButton
            icon="xmark"
            type={buttonType}
            size="md"
            onPress={onClose}
        />
    );

    const backButton = (
        <UIButton
            icon="chevron.left"
            type={buttonType}
            size="md"
            onPress={onBack || onClose}
        />
    );

    return (
        <Modal
            animationType="slide"
            presentationStyle="pageSheet"
            transparent={false}
            visible={isOpen}
            onRequestClose={onClose}
        >
            <UIStatusBar type="sheet" />
            <UIView themeColor="backgroundSecondary" style={{ flex: 1, paddingTop: topPadding }}>
                {/* Header */}
                <View style={[styles.header, { borderBottomColor: separatorColor }]}>
                    <View style={styles.headerLeft}>
                        {showBackButton ? backButton : (hasHeaderButtons ? closeButton : null)}
                    </View>
                    <View style={styles.headerCenter}>
                        {typeof title === 'string' ? (
                            <UIText size="lg" font="semibold" numberOfLines={1}>
                                {title}
                            </UIText>
                        ) : (
                            title
                        )}
                    </View>
                    <View style={styles.headerRight}>
                        {headerButtons || (!showBackButton && !hasHeaderButtons ? closeButton : null)}
                    </View>
                </View>

                {/* Content */}
                {children}
            </UIView>
        </Modal>
    );
}

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingVertical: 6,
        minHeight: 52,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    headerLeft: {
        minWidth: 44,
        alignItems: 'flex-start',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerRight: {
        minWidth: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 8,
    },
});
