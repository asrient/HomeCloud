import { useEffect, useCallback } from "react";

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
