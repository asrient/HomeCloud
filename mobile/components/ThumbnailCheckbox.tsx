import { View, ViewStyle } from 'react-native';
import { UIText } from './ui/UIText';
import { useThemeColor } from '@/hooks/useThemeColor';

export function ThumbnailCheckbox({ isSelected, position }: {
    isSelected: boolean;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
}) {
    const highlightColor = useThemeColor({}, 'highlight');
    const highlightTextColor = useThemeColor({}, 'highlightText');

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

    return (
        <View style={{
            ...positionStyles,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: isSelected ? highlightColor : 'rgba(255, 255, 255, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: isSelected ? highlightTextColor : '#ccc',
        }}>
            {isSelected &&
                <UIText style={{ color: highlightTextColor, fontWeight: 'bold' }}>✓</UIText>}
        </View>
    );
}
