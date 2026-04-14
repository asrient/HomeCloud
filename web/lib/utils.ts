import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { PageUIConfig } from "./types";
import { OSType, UITheme } from "./enums";
import { DeviceInfo } from "shared/types";
import ServiceController from "shared/controller";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function nameToInitials(name: string) {
  const parts = name.split(" ")
  return parts.map((part) => part[0]).join("").toUpperCase();
}

export function truncateMiddle(text: string, maxLength: number, endChars = 6): string {
  if (text.length <= maxLength) return text;
  const startLen = maxLength - endChars - 1;
  if (startLen < 1) return text.slice(0, maxLength - 1) + '…';
  return text.slice(0, startLen) + '…' + text.slice(-endChars);
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
  if (typeof window === 'undefined') return false;
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
    case OSType.Android:
      iconKey = 'android';
      break;
    case OSType.MacOS:
    case OSType.iOS:
      iconKey = 'apple';
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

/**
 * Check if a service method is available on a service controller.
 */
export async function isServiceAvailable(sc: ServiceController, path: string): Promise<boolean> {
  try {
    return await sc.app.isMethodAvailable(path);
  } catch {
    return false;
  }
}

export async function getServiceController(fingerprint: string | null) {
  if (typeof window === 'undefined') {
    throw new Error('getServiceController can only be called in browser environment');
  }
  if (!fingerprint) {
    return window.modules.getLocalServiceController();
  }
  return window.modules.getRemoteServiceController(fingerprint);
}

export function getLocalServiceController() {
  if (typeof window === 'undefined') {
    throw new Error('getLocalServiceController can only be called in browser environment');
  }
  return window.modules.getLocalServiceController();
}

/**
 * Get a service controller only if the device is already connected.
 * Fails fast without triggering a reconnection attempt.
 */
export async function getExistingServiceController(fingerprint: string | null) {
  if (typeof window === 'undefined') {
    throw new Error('getExistingServiceController can only be called in browser environment');
  }
  return window.modules.getExistingServiceController(fingerprint);
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
  // In dev mode, allow localStorage override (client-only)
  if (typeof window !== 'undefined' && window.modules?.config?.IS_DEV) {
    const devTheme = localStorage.getItem(DEV_THEME_KEY);
    if (!!devTheme) {
      uiThemeCache = devTheme as UITheme;
      return uiThemeCache;
    }
  }
  // Use build-time env var
  // Note: We are not using window.modules.config.UI_THEME anymore due to SSR issues. 
  // Instead, we rely on build-time env variable which is inlined by Next.js. 
  // This means the theme is determined at build time and cannot be changed at runtime in production, 
  // which is a trade-off we accept for better SSR support.
  const buildTheme = process.env.NEXT_PUBLIC_UI_THEME;
  if (!buildTheme) {
    throw new Error('NEXT_PUBLIC_UI_THEME environment variable must be set');
  }
  uiThemeCache = buildTheme as UITheme;
  return uiThemeCache;
}

export function DEV_OverrideUITheme(theme: UITheme | null) {
  if (typeof window === 'undefined') {
    throw new Error('DEV_OverrideUITheme can only be called in browser environment');
  }
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

export function isMacos(): boolean {
  if (typeof window === 'undefined') return false;
  return window.modules.config.OS === OSType.MacOS;
}

export function isWindows(): boolean {
  if (typeof window === 'undefined') return false;
  return window.modules.config.OS === OSType.Windows;
}

export function getAppName() {
  if (typeof window === 'undefined') return 'App';
  if (window.modules?.config?.APP_NAME) {
    return window.modules.config.APP_NAME;
  }
  return 'App';
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

export function cronToHuman(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return cron;
  const [min, hour, dom, mon, dow] = parts;

  // Every minute
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute';

  // Every N minutes
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(min.slice(2));
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }

  // Every N hours
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(hour.slice(2));
    return n === 1 ? 'Every hour' : `Every ${n} hours`;
  }

  // Every hour at :MM
  if (!min.includes('*') && !min.includes('/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every hour at :${min.padStart(2, '0')}`;
  }

  // Daily at HH:MM
  if (!min.includes('*') && !hour.includes('*') && dom === '*' && mon === '*' && dow === '*') {
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  // Weekly on specific day
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (!min.includes('*') && !hour.includes('*') && dom === '*' && mon === '*' && dow !== '*' && !dow.includes(',')) {
    const dayIdx = parseInt(dow);
    const dayName = dayNames[dayIdx] ?? dow;
    return `Every ${dayName} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  // Monthly on specific day
  if (!min.includes('*') && !hour.includes('*') && dom !== '*' && mon === '*' && dow === '*') {
    const suffix = dom === '1' ? 'st' : dom === '2' ? 'nd' : dom === '3' ? 'rd' : 'th';
    return `Monthly on the ${dom}${suffix} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }

  return cron;
}
