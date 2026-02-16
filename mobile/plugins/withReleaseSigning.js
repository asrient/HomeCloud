const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Expo config plugin that adds release signing configuration to the Android build.
 * 
 * Reads keystore credentials from ~/.gradle/gradle.properties (never committed):
 *   MYAPP_UPLOAD_STORE_FILE=C:\\Users\\you\\my-upload-key.keystore
 *   MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
 *   MYAPP_UPLOAD_STORE_PASSWORD=*****
 *   MYAPP_UPLOAD_KEY_PASSWORD=*****
 * See: https://docs.expo.dev/guides/local-app-production/
 */
function withReleaseSigning(config) {
    return withAppBuildGradle(config, (config) => {
        const buildGradle = config.modResults.contents;

        // Add release signing config block after debug signing config
        const signingConfigRegex = /(signingConfigs\s*\{[\s\S]*?debug\s*\{[\s\S]*?\})/;
        const releaseSigningBlock = `$1
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }`;

        let modified = buildGradle.replace(signingConfigRegex, releaseSigningBlock);

        // Update release buildType to use release signing config
        modified = modified.replace(
            /(release\s*\{[^}]*?)signingConfig\s+signingConfigs\.debug/,
            '$1signingConfig signingConfigs.release'
        );

        config.modResults.contents = modified;
        return config;
    });
}

module.exports = withReleaseSigning;
