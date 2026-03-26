const { version } = require("./package.json");

// Convert semver "major.minor.patch" → single integer for Android versionCode.
// e.g. "0.0.3" → 3, "0.1.0" → 100, "1.2.3" → 10203
const [major, minor, patch] = version.split(".").map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

// Extends app.json with dynamic values. Version is sourced from package.json.
module.exports = ({ config }) => ({
  ...config,
  version,
  android: {
    ...config.android,
    versionCode,
  },
  ios: {
    ...config.ios,
    buildNumber: String(versionCode),
  },
});
