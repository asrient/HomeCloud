import { UIIcon } from '@/components/ui/UIIcon';
import { useThemeColor } from '@/hooks/useThemeColor';
import { SymbolViewProps } from 'expo-symbols';
import { UIText } from './UIText';
import { HeaderButton } from '@react-navigation/elements';
import { isGlassEnabled, isIos } from '@/lib/utils';

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

    const highlightColor = useThemeColor({}, 'highlight');

    const contentColor = (isHighlight || (isIos && !isGlassEnabled)) ? highlightColor : themeColor;

    return (
        <HeaderButton disabled={disabled} onPress={onPress}>
            {
                name && <UIIcon
                    name={name}
                    size={26}
                    weight='regular'
                    color={contentColor}
                />
            }
            {text && <UIText style={{ color: contentColor }}>{text}</UIText>}
        </HeaderButton>
    );
}
