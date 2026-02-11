import { useEffect, useCallback } from "react";
import { getUITheme, UI_THEMES } from "@/lib/utils";

export function useDarkMode() {

    const applyDarkMode = useCallback((isDark: boolean) => {
        console.log("Applying dark mode:", isDark);
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        applyDarkMode(mediaQuery.matches);

        const handleChange = (event: MediaQueryListEvent) => {
            applyDarkMode(event.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => {
            mediaQuery.removeEventListener('change', handleChange);
        };
    }, [applyDarkMode]);
}

export function useUIThemeClass() {
    useEffect(() => {
        if (typeof document === 'undefined') return; // SSR safety
        const root = document.documentElement;
        const theme = getUITheme();
        // Remove any previously present theme classes (in case of hot reload / dev override)
        UI_THEMES.forEach(t => {
            if (root.classList.contains(t)) {
                root.classList.remove(t);
            }
        });
        // Add the current theme class
        root.classList.add(theme);
    }, []);
}
