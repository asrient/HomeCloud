import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { PageUIConfig } from "./types";
import { OSType, UITheme } from "./enums";
import { DeviceInfo } from "shared/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nameToInitials(name: string) {
  const parts = name.split(" ")
  return parts.map((part) => part[0]).join("").toUpperCase();
}

export function openExternalLink(url: string) {
  window.open(url, "_blank")
}

export function buildPageConfig(noAppShell = false): PageUIConfig {
  return {
    noAppShell,
  }
}

export function isMobile() {
  return window.innerWidth < 768
}

export function getGreetings() {
  const date = new Date()
  const hours = date.getHours()

  if (hours < 12) {
    return "Good morning"
  } else if (hours < 18) {
    return "Good afternoon"
  } else {
    return "Good evening"
  }
}

export function getUrlFromIconKey(iconKey?: string | null) {
  iconKey = iconKey || 'pc';
  // compat: replace - with _
  iconKey = iconKey.replace(/-/g, '_');
  return `/icons/d/${iconKey}.png`;
}

export function getOSIconUrl(deviceInfo: DeviceInfo) {
  let iconKey = 'icon';
  switch (deviceInfo.os) {
    case OSType.Windows:
      iconKey = 'windows';
      break;
    case OSType.MacOS:
      iconKey = 'macos';
      break;
    case OSType.Linux:
      iconKey = 'linux';
      break;
  }
  return `/icons/${iconKey}.png`;
}

export function printFingerprint(fingerprint: string, full = false) {
  if (full) {
    return fingerprint;
  }
  return `$${fingerprint.slice(0, 8)}`;
}

export async function getServiceController(fingerprint: string | null) {
  if (!fingerprint) {
    return window.modules.getLocalServiceController();
  }
  return window.modules.getRemoteServiceController(fingerprint);
}

// https://css-tricks.com/converting-color-spaces-in-javascript/
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  // Make r, g, and b fractions of 1
  r /= 255;
  g /= 255;
  b /= 255;

  // Find greatest and smallest channel values
  let cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin,
    h = 0,
    s = 0,
    l = 0;

  // Calculate hue
  // No difference
  if (delta === 0)
    h = 0;
  // Red is max
  else if (cmax === r)
    h = ((g - b) / delta) % 6;
  // Green is max
  else if (cmax === g)
    h = (b - r) / delta + 2;
  // Blue is max
  else
    h = (r - g) / delta + 4;

  h = Math.round(h * 60);

  // Make negative hues positive behind 360°
  if (h < 0)
    h += 360;

  // Calculate lightness
  l = (cmax + cmin) / 2;

  // Calculate saturation
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  // Multiply l and s by 100
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return [h, s, l];
}

export function hexToNumber(hex: string): number {
  return parseInt(hex, 16);
}

export function rgbHexToHsl(hex: string): [number, number, number] {
  if (hex.startsWith('#')) {
    hex = hex.slice(1);
  }
  const red = hex.substr(0, 2) // "aa"
  const green = hex.substr(2, 2) // "bb"
  const blue = hex.substr(4, 2) // "cc"
  const alpha = hex.substr(6, 2) // "dd"
  return rgbToHsl(hexToNumber(red), hexToNumber(green), hexToNumber(blue));
}

export function setCssVariable(name: string, value: string) {
  document.documentElement.style.setProperty(`--${name}`, value);
}

export function normalizeNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function setPrimaryColorHsl(h: number, s: number, l: number) {
  s = normalizeNumber(s, 55, 100);
  l = normalizeNumber(l, 55, 70);
  const color = `${h} ${s}% ${l}%`;
  setCssVariable('primary', color);
  setCssVariable('ring', color);
}

let uiThemeCache: UITheme | null = null;

const DEV_THEME_KEY = 'dev-ui-theme';

export function getUITheme(): UITheme {
  if (uiThemeCache) {
    return uiThemeCache;
  }
  if (window.modules.config.IS_DEV) {
    const devTheme = localStorage.getItem(DEV_THEME_KEY);
    if (!!devTheme) {
      uiThemeCache = devTheme as UITheme;
    } else {
      uiThemeCache = window.modules.config.UI_THEME;
    }
  } else {
    uiThemeCache = window.modules.config.UI_THEME;
  }
  return uiThemeCache;
}

export function DEV_OverrideUITheme(theme: UITheme | null) {
  if (!window.modules.config.IS_DEV) {
    throw new Error('Can only override theme in dev mode');
  }
  if (theme) {
    localStorage.setItem(DEV_THEME_KEY, theme);
  } else {
    localStorage.removeItem(DEV_THEME_KEY);
  }
  window.location.reload();
}

export function isWin11Theme(): boolean {
  return getUITheme() === UITheme.Win11;
}

export function isMacosTheme(): boolean {
  return getUITheme() === UITheme.Macos;
}

export const UI_THEMES = [UITheme.Macos, UITheme.Win11];
