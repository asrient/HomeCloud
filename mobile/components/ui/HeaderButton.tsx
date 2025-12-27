import { UIIcon } from '@/components/ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SymbolViewProps } from 'expo-symbols';
import { Pressable } from 'react-native';

export function HeaderButton({
    name,
    onPress,
}: {
    name: SymbolViewProps['name'];
    onPress: () => void;
}) {
    const themeColor = useThemeColor({}, 'text');
    return (
        <Pressable style={{ padding: 4 }} onPress={onPress}>
            <UIIcon
                name={name}
                size={28}
                weight='regular'
                color={themeColor}
            />
        </Pressable>
    );
}
