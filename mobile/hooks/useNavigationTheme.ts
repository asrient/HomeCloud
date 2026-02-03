import { useMemo } from 'react';
import { Platform } from 'react-native';
import { Theme } from '@react-navigation/native';
import { ColorsAndroid, ColorsIos } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

/**
 * Custom hook that provides a React Navigation theme based on the current color scheme.
 * Uses Material You colors on Android and iOS system colors on iOS.
 */
export function useNavigationTheme(): Theme {
    const colorScheme = useColorScheme();

    const theme = useMemo(() => {
        const isDark = colorScheme === 'dark';
        const colors = Platform.OS === 'android'
            ? (isDark ? ColorsAndroid.dark : ColorsAndroid.light)
            : (isDark ? ColorsIos.dark : ColorsIos.light);

        return {
            dark: isDark,
            colors: {
                primary: colors.highlight,
                background: colors.background,
                card: colors.backgroundSecondary,
                text: colors.text,
                border: colors.seperator,
                notification: colors.highlight,
            },
            fonts: {
                regular: {
                    fontFamily: 'System',
                    fontWeight: '400' as const,
                },
                medium: {
                    fontFamily: 'System',
                    fontWeight: '500' as const,
                },
                bold: {
                    fontFamily: 'System',
                    fontWeight: '700' as const,
                },
                heavy: {
                    fontFamily: 'System',
                    fontWeight: '900' as const,
                },
            },
        };
    }, [colorScheme]);

    return theme;
}
