import { Platform, View, ViewStyle } from 'react-native';
import { UIIcon } from './ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';

const isIos = Platform.OS === 'ios';

export function ThumbnailCheckbox({ isSelected, position, disabled }: {
    isSelected: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    disabled?: boolean;
}) {
    const highlightColor = useThemeColor({}, 'highlight');
    const highlightTextColor = useThemeColor({}, 'highlightText');
    const disabledColor = useThemeColor({}, 'seperator');

    let positionStyles: ViewStyle = {
        position: 'absolute',
    };
    switch (position) {
        case 'top-left':
            positionStyles = { position: 'absolute', top: 5, left: 5 };
            break;
        case 'top-right':
            positionStyles = { position: 'absolute', top: 5, right: 5 };
            break;
        case 'bottom-left':
            positionStyles = { position: 'absolute', bottom: 5, left: 5 };
            break;
        case 'bottom-right':
            positionStyles = { position: 'absolute', bottom: 5, right: 5 };
            break;
        case 'center':
            positionStyles = { position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -12 }, { translateY: -12 }] };
            break;
        default:
            positionStyles = {};
    }

    const size = isIos ? 24 : 22;
    const borderRadius = isIos ? 12 : 6;

    return (
        <View style={{
            ...positionStyles,
            width: size,
            height: size,
            borderRadius,
            backgroundColor: isSelected ? highlightColor : disabled ? disabledColor : 'rgba(255, 255, 255, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: isIos ? 1 : 2,
            borderColor: isSelected ? highlightTextColor : disabledColor,
        }}>
            {isSelected &&
                <UIIcon name="checkmark" size={16} color={highlightTextColor} />}
        </View>
    );
}
