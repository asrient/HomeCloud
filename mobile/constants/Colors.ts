/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { isLiquidGlassAvailable } from 'expo-glass-effect';
import materialTheme from './material-theme.json';

export type ThemeColors = {
  text: string;
  textSecondary: string;
  textTertiary: string;
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  icon: string;
  highlight: string;
  highlightText: string;
  seperator: string;
  accentText: string;
  primaryRipple: string;
};

export type ColorPalette = {
  light: ThemeColors;
  dark: ThemeColors;
};

/**
 * iOS 26+ Liquid Glass color palette.
 * Optimised for translucent glass chrome and vibrant accent colors.
 */
export const ColorsIos: ColorPalette = {
  light: {
    text: '#000000',
    textSecondary: '#8A8A8E',
    textTertiary: '#C4C4C6',
    background: '#fff',
    backgroundSecondary: '#F2F2F7',
    backgroundTertiary: '#E4E4E6',
    icon: '#000000',
    highlight: '#FF0044',
    highlightText: '#ffffff',
    seperator: '#C6C6C8',
    accentText: '#000000',
    primaryRipple: '#FF004420',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#D2D2D2',
    textTertiary: '#9F9F9F',
    background: '#000',
    backgroundSecondary: '#1C1C1E',
    backgroundTertiary: '#2C2C2E',
    icon: '#FFFFFF',
    highlight: '#FF4D6F',
    highlightText: '#ffffff',
    seperator: '#3A3A3C',
    accentText: '#FFFFFF',
    primaryRipple: '#FF4D6F20',
  },
};

if (!isLiquidGlassAvailable()) {
  /**
   * Classic iOS color palette for pre-iOS 26 devices or when DEV_FORCE_CLASSIC_IOS is true.
   * Uses more muted colors and higher contrast for better readability without translucency.
   */
  ColorsIos['light'] = {
    ...ColorsIos.light,
    //icon: ColorsIos.light.highlight,
  };
  ColorsIos['dark'] = {
    ...ColorsIos.dark,
  };
};

/**
 * Android colors based on Material You theme (seed: #E2362A)
 * Generated from material-theme.json
 *
 * Mapping from ThemeColors to Material You tokens:
 *   text            -> onSurface
 *   textSecondary   -> onSurfaceVariant
 *   textTertiary    -> outline
 *   background      -> surface
 *   backgroundSecondary -> surfaceContainer
 *   backgroundTertiary  -> surfaceContainerHigh
 *   icon            -> onSurface
 *   highlight       -> primary
 *   highlightText   -> onPrimary
 *   seperator       -> outlineVariant
 */
export const ColorsAndroid: ColorPalette = {
  light: {
    text: materialTheme.schemes.light.onSurface,
    textSecondary: materialTheme.schemes.light.onSurfaceVariant,
    textTertiary: materialTheme.schemes.light.outline,
    background: materialTheme.schemes.light.surface,
    backgroundSecondary: materialTheme.schemes.light.surfaceContainer,
    backgroundTertiary: materialTheme.schemes.light.secondaryContainer,
    icon: materialTheme.schemes.light.onSurface,
    highlight: materialTheme.schemes.light.primary,
    highlightText: materialTheme.schemes.light.onPrimary,
    seperator: materialTheme.schemes.light.outlineVariant,
    accentText: materialTheme.schemes.light.onSecondaryContainer,
    primaryRipple: materialTheme.schemes.light.primary + '20',
  },
  dark: {
    text: materialTheme.schemes.dark.onSurface,
    textSecondary: materialTheme.schemes.dark.onSurfaceVariant,
    textTertiary: materialTheme.schemes.dark.outline,
    background: materialTheme.schemes.dark.surface,
    backgroundSecondary: materialTheme.schemes.dark.surfaceContainer,
    backgroundTertiary: materialTheme.schemes.dark.secondaryContainer,
    icon: materialTheme.schemes.dark.onSurface,
    highlight: materialTheme.schemes.dark.primary,
    highlightText: materialTheme.schemes.dark.onPrimary,
    seperator: materialTheme.schemes.dark.outlineVariant,
    accentText: materialTheme.schemes.dark.onSecondaryContainer,
    primaryRipple: materialTheme.schemes.dark.primary + '20',
  },
};
