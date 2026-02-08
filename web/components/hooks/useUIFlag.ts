import { useMemo } from 'react';
import { useAppState } from './useAppState';
import { isMacosTheme } from '@/lib/utils';
import { OSType } from '@/lib/enums';

const DEV_LIQUID_GLASS_KEY = 'dev-liquid-glass';

function getDevLiquidGlassOverride(): boolean | null {
    if (typeof window === 'undefined') return null;
    if (!window.modules?.config?.IS_DEV) return null;
    const value = localStorage.getItem(DEV_LIQUID_GLASS_KEY);
    if (value === null) return null;
    return value === 'true';
}

/**
 * Hook that provides OS version information and liquid glass support.
 * 
 * `supportLiquidGlass` is true when running on macOS 26 (Tahoe) or above
 * with the macOS theme, unless overridden via the dev config menu.
 * 
 * Derives the value from `deviceInfo` stored in app state.
 */
export function useUIFlag() {
    const { deviceInfo } = useAppState();

    const supportLiquidGlass = useMemo(() => {
        // Dev override takes priority
        const devOverride = getDevLiquidGlassOverride();
        if (devOverride !== null) {
            return devOverride;
        }
        // Must be macOS theme
        if (!isMacosTheme()) return false;
        // Need device info to check version
        if (!deviceInfo) return false;
        if (deviceInfo.os !== OSType.MacOS) return false;
        // osFlavour on macOS is the version string, e.g. "15", "26"
        const osFlavour = deviceInfo.osFlavour;
        if (!osFlavour) return false;
        const majorVersion = parseInt(osFlavour, 10);
        return !isNaN(majorVersion) && majorVersion >= 26;
    }, [deviceInfo]);

    return { supportLiquidGlass, deviceInfo };
}

export function DEV_OverrideLiquidGlass(value: boolean | null) {
    if (typeof window === 'undefined') {
        throw new Error('DEV_OverrideLiquidGlass can only be called in browser environment');
    }
    if (!window.modules.config.IS_DEV) {
        throw new Error('Can only override liquid glass in dev mode');
    }
    if (value !== null) {
        localStorage.setItem(DEV_LIQUID_GLASS_KEY, String(value));
    } else {
        localStorage.removeItem(DEV_LIQUID_GLASS_KEY);
    }
    window.location.reload();
}
