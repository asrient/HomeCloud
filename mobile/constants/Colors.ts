/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

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
};

export type ColorPallette = {
  light: ThemeColors;
  dark: ThemeColors;
};

export const ColorsIos: ColorPallette = {
  light: {
    text: '#000000',
    textSecondary: '#8A8A8E',
    textTertiary: '#C4C4C6',
    background: '#fff',
    backgroundSecondary: '#F2F2F7',
    backgroundTertiary: '#E4E4E6',
    icon: '#000000',
    highlight: '#007AFF',
    highlightText: '#ffffff',
  },
  dark: {
    text: '#FFFFFF',
    textSecondary: '#F3F3F8',
    textTertiary: '#F8F8FC',
    background: '#000',
    backgroundSecondary: '#1C1C1E',
    backgroundTertiary: '#2C2C2E',
    icon: '#FFFFFF',
    highlight: '#0A84FF',
    highlightText: '#ffffff',
  },
};

export const ColorsAndroid: ColorPallette = {
  light: {
    ...ColorsIos.light,
  },
  dark: {
    ...ColorsIos.dark,
  },
};
