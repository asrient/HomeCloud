const { withAndroidStyles, withAndroidColors, withDangerousMod } = require('@expo/config-plugins');
const { resolve } = require('path');
const { writeFileSync, mkdirSync, existsSync, readFileSync } = require('fs');

// Load material theme from JSON file
function loadMaterialTheme(projectRoot) {
    const themePath = resolve(projectRoot, 'constants/material-theme.json');
    const themeJson = readFileSync(themePath, 'utf8');
    return JSON.parse(themeJson);
}

// Map Material Theme Builder JSON to Android color resource names
function mapThemeToAndroidColors(scheme) {
    return {
        colorPrimary: scheme.primary,
        colorOnPrimary: scheme.onPrimary,
        colorPrimaryContainer: scheme.primaryContainer,
        colorOnPrimaryContainer: scheme.onPrimaryContainer,
        colorSecondary: scheme.secondary,
        colorOnSecondary: scheme.onSecondary,
        colorSecondaryContainer: scheme.secondaryContainer,
        colorOnSecondaryContainer: scheme.onSecondaryContainer,
        colorTertiary: scheme.tertiary,
        colorOnTertiary: scheme.onTertiary,
        colorTertiaryContainer: scheme.tertiaryContainer,
        colorOnTertiaryContainer: scheme.onTertiaryContainer,
        colorError: scheme.error,
        colorOnError: scheme.onError,
        colorErrorContainer: scheme.errorContainer,
        colorOnErrorContainer: scheme.onErrorContainer,
        colorSurface: scheme.surface,
        colorOnSurface: scheme.onSurface,
        colorSurfaceVariant: scheme.surfaceVariant,
        colorOnSurfaceVariant: scheme.onSurfaceVariant,
        colorSurfaceContainer: scheme.surfaceContainer,
        colorSurfaceContainerHigh: scheme.surfaceContainerHigh,
        colorSurfaceContainerLow: scheme.surfaceContainerLow,
        colorOutline: scheme.outline,
        colorOutlineVariant: scheme.outlineVariant,
        colorPrimaryDark: scheme.onPrimaryContainer,
        splashscreen_background: scheme.surface,
        iconBackground: scheme.surface,
    };
}

function withMaterial3Colors(config) {
    // Add light theme colors
    config = withAndroidColors(config, (config) => {
        const materialTheme = loadMaterialTheme(config.modRequest.projectRoot);
        const lightColors = mapThemeToAndroidColors(materialTheme.schemes.light);
        const colors = config.modResults;

        colors.resources.color = colors.resources.color || [];
        const existingColors = colors.resources.color;

        // Add/update light theme colors
        Object.entries(lightColors).forEach(([name, value]) => {
            const existingIndex = existingColors.findIndex(c => c.$.name === name);
            const colorEntry = { $: { name }, _: value };

            if (existingIndex >= 0) {
                existingColors[existingIndex] = colorEntry;
            } else {
                existingColors.push(colorEntry);
            }
        });

        return config;
    });

    // Add dark theme colors
    config = withDangerousMod(config, [
        'android',
        async (config) => {
            const materialTheme = loadMaterialTheme(config.modRequest.projectRoot);
            const darkColors = mapThemeToAndroidColors(materialTheme.schemes.dark);

            const nightColorsDir = resolve(
                config.modRequest.platformProjectRoot,
                'app/src/main/res/values-night'
            );

            if (!existsSync(nightColorsDir)) {
                mkdirSync(nightColorsDir, { recursive: true });
            }

            const nightColorsXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
${Object.entries(darkColors)
                    .map(([name, value]) => `  <color name="${name}">${value}</color>`)
                    .join('\n')}
</resources>`;

            writeFileSync(resolve(nightColorsDir, 'colors.xml'), nightColorsXml);

            return config;
        },
    ]);

    return config;
}

function withMaterial3Styles(config) {
    return withAndroidStyles(config, (config) => {
        const styles = config.modResults;

        const appTheme = styles.resources.style?.find(s => s.$.name === 'AppTheme');

        if (appTheme) {
            appTheme.$.parent = 'Theme.Material3.DayNight.NoActionBar';
            appTheme.item = appTheme.item || [];

            const material3Items = [
                { $: { name: 'colorPrimary' }, _: '@color/colorPrimary' },
                { $: { name: 'colorOnPrimary' }, _: '@color/colorOnPrimary' },
                { $: { name: 'colorPrimaryContainer' }, _: '@color/colorPrimaryContainer' },
                { $: { name: 'colorOnPrimaryContainer' }, _: '@color/colorOnPrimaryContainer' },
                { $: { name: 'colorSecondary' }, _: '@color/colorSecondary' },
                { $: { name: 'colorOnSecondary' }, _: '@color/colorOnSecondary' },
                { $: { name: 'colorSecondaryContainer' }, _: '@color/colorSecondaryContainer' },
                { $: { name: 'colorOnSecondaryContainer' }, _: '@color/colorOnSecondaryContainer' },
                { $: { name: 'colorTertiary' }, _: '@color/colorTertiary' },
                { $: { name: 'colorOnTertiary' }, _: '@color/colorOnTertiary' },
                { $: { name: 'colorTertiaryContainer' }, _: '@color/colorTertiaryContainer' },
                { $: { name: 'colorOnTertiaryContainer' }, _: '@color/colorOnTertiaryContainer' },
                { $: { name: 'colorError' }, _: '@color/colorError' },
                { $: { name: 'colorOnError' }, _: '@color/colorOnError' },
                { $: { name: 'colorErrorContainer' }, _: '@color/colorErrorContainer' },
                { $: { name: 'colorOnErrorContainer' }, _: '@color/colorOnErrorContainer' },
                { $: { name: 'colorSurface' }, _: '@color/colorSurface' },
                { $: { name: 'colorOnSurface' }, _: '@color/colorOnSurface' },
                { $: { name: 'colorSurfaceVariant' }, _: '@color/colorSurfaceVariant' },
                { $: { name: 'colorOnSurfaceVariant' }, _: '@color/colorOnSurfaceVariant' },
                { $: { name: 'colorOutline' }, _: '@color/colorOutline' },
                { $: { name: 'colorOutlineVariant' }, _: '@color/colorOutlineVariant' },
                { $: { name: 'colorSurfaceContainer' }, _: '@color/colorSurfaceContainer' },
                { $: { name: 'colorSurfaceContainerHigh' }, _: '@color/colorSurfaceContainerHigh' },
                { $: { name: 'colorSurfaceContainerLow' }, _: '@color/colorSurfaceContainerLow' },
                { $: { name: 'android:colorBackground' }, _: '@color/colorSurface' },
                { $: { name: 'android:statusBarColor' }, _: '@color/colorSurface' },
                { $: { name: 'android:navigationBarColor' }, _: '@color/colorSurfaceContainer' },
            ];

            material3Items.forEach(newItem => {
                const existingIndex = appTheme.item.findIndex(
                    item => item.$.name === newItem.$.name
                );

                if (existingIndex >= 0) {
                    appTheme.item[existingIndex] = newItem;
                } else {
                    appTheme.item.push(newItem);
                }
            });
        }

        return config;
    });
}

function withMaterial3Theme(config) {
    config = withMaterial3Colors(config);
    config = withMaterial3Styles(config);
    return config;
}

module.exports = withMaterial3Theme;
