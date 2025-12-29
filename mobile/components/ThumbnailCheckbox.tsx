import { View } from 'react-native';
import { UIText } from './ui/UIText';
import { useThemeColor } from '@/hooks/useThemeColor';

export function ThumbnailCheckbox({ isSelected }: { isSelected: boolean; }) {
    const highlightColor = useThemeColor({}, 'highlight');
    const highlightTextColor = useThemeColor({}, 'highlightText');
    return (
        <View style={{
            position: 'absolute',
            top: 5,
            right: 5,
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
