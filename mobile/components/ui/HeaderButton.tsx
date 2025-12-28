import { UIIcon } from '@/components/ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SymbolViewProps } from 'expo-symbols';
import { Pressable } from 'react-native';
import { UIText } from './UIText';

export function HeaderButton({
    name,
    text,
    onPress,
    isActive,
}: {
    name?: SymbolViewProps['name'];
    text?: string;
    onPress: () => void;
    isActive?: boolean;
}) {
    const themeColor = useThemeColor({}, 'text');

    const activeColor = useThemeColor({ light: '#007AFF', dark: '#0a84ff' }, 'text');

    return (
        <Pressable style={{ padding: 4}} onPress={onPress}>
            {name && <UIIcon
                name={name}
                size={28}
                weight='regular'
                color={isActive ? activeColor : themeColor}
            />}
            {text && <UIText style={{ color: isActive ? activeColor : themeColor }}>{text}</UIText>}
        </Pressable>
    );
}
