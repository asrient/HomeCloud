/**
 * Resolves the UI_THEME environment variable at build time.
 * Shared between next.config.js and tailwind.config.js.
 *
 * - Accepts 'macos', 'win11', or 'windows' (converted to 'win11').
 * - In production (NODE_ENV=production), throws if UI_THEME is not set.
 * - In dev, defaults based on process.platform.
 */
function resolveUITheme() {
    let theme = process.env.UI_THEME;

    if (!theme) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('UI_THEME environment variable must be set in production');
        }
        theme = process.platform === 'darwin' ? 'macos' : 'win11';
        console.log(`UI_THEME not set, defaulting to '${theme}' based on OS`);
    }

    // Normalize legacy 'windows' value
    if (theme === 'windows') {
        theme = 'win11';
    }

    return theme;
}

module.exports = { resolveUITheme };
