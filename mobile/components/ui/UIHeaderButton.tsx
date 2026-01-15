import { UIIcon } from '@/components/ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SymbolViewProps } from 'expo-symbols';
import { UIText } from './UIText';
import { HeaderButton } from '@react-navigation/elements';

export function UIHeaderButton({
    name,
    text,
    onPress,
    isHighlight,
    disabled,
}: {
    name?: SymbolViewProps['name'];
    text?: string;
    onPress?: () => void;
    isHighlight?: boolean;
    disabled?: boolean;
}) {
    const themeColor = useThemeColor({}, 'icon');

    const highlightColor = useThemeColor({ light: '#007AFF', dark: '#0a84ff' }, 'icon');

    const contentColor = isHighlight ? highlightColor : themeColor;

    return (
        <HeaderButton disabled={disabled} onPress={onPress}>
            {
                name && <UIIcon
                    name={name}
                    size={28}
                    weight='regular'
                    color={contentColor}
                />
            }
            {text && <UIText style={{ color: contentColor }}>{text}</UIText>}
        </HeaderButton>
    );
}
