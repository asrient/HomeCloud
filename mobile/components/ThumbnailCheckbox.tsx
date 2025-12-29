import { View } from 'react-native';
import { UIText } from './ui/UIText';

export function ThumbnailCheckbox({ isSelected }: { isSelected: boolean; }) {
    return (
        <View style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: isSelected ? '#007AFF' : 'rgba(255, 255, 255, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: isSelected ? 'white' : '#ccc',
        }}>
            {isSelected &&
                <UIText style={{ color: 'white', fontWeight: 'bold' }}>✓</UIText>}
        </View>
    );
}
