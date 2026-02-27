# Mobile — React Native / Expo

Expo SDK 54 app with a custom native module (`superman`) for TCP/UDP networking, file system access, and thumbnails. Uses expo-router v6 with native tabs.

```bash
cd mobile
npm install

# iOS
npm run ios                         # simulator
npm run iosd                        # physical device
npm run iosd:release                # release build on device

# Android
npm run android

# Rebuild native projects after config changes
npm run prebuild                    # expo prebuild --clean
```

## Android Release Build

To build a signed `.aab` for Google Play, you need an upload keystore and Gradle signing variables. The keystore and credentials are kept outside the repo so nothing secret is committed.

> **Play App Signing:** Google Play manages the actual app signing key. The keystore you create here is just an **upload key** used to authenticate your builds. If you ever lose it, you can request a reset from Google — your app won't be locked out. Play App Signing is enabled by default for new apps.

### 1. Create an upload keystore

```bash
keytool -genkey -v -keystore hc-android-key.keystore -alias hc-android -keyalg RSA -keysize 2048 -validity 10000
```

Move the generated file to your home directory (e.g. `C:\Users\you\hc-android-key.keystore` or `~/hc-android-key.keystore`). Back it up securely — while you can request a reset via Play Console, having it avoids downtime.

### 2. Add signing variables to `~/.gradle/gradle.properties`

Create or edit `~/.gradle/gradle.properties` and add:

```properties
MYAPP_UPLOAD_STORE_FILE=C:\\Users\\you\\hc-android-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=hc-android
MYAPP_UPLOAD_STORE_PASSWORD=your_store_password
MYAPP_UPLOAD_KEY_PASSWORD=your_store_password
```

> `MYAPP_UPLOAD_KEY_PASSWORD` is typically the same as `MYAPP_UPLOAD_STORE_PASSWORD` (keytool defaults to the store password).

> On macOS/Linux use a forward-slash path like `/Users/you/hc-android-key.keystore`.

This file is in your home directory. Gradle merges it with project-level properties automatically.

### 3. Build the release bundle

```bash
cd mobile
npx expo prebuild --platform android --clean   # regenerate android/ with signing config
cd android
./gradlew bundleRelease                         # produces app-release.aab
```

The signed `.aab` will be at `android/app/build/outputs/bundle/release/app-release.aab`.

To set environment variables (e.g. server URL) for the build:

```bash
# PowerShell
$env:EXPO_PUBLIC_SERVER_URL = "https://your-server.com"; ./gradlew bundleRelease

# Bash
EXPO_PUBLIC_SERVER_URL="https://your-server.com" ./gradlew bundleRelease
```

### Notes

- The `withReleaseSigning` config plugin in `plugins/withReleaseSigning.js` injects the signing config into `build.gradle` during prebuild. If the Gradle properties are not set, it falls back to the debug signing config, so dev builds are unaffected.
- See the [Expo local production build guide](https://docs.expo.dev/guides/local-app-production/) for more details.

## CI / GitHub Actions

The **Android Release** workflow (`.github/workflows/android-release.yml`) builds a signed `.aab` and uploads it as a downloadable artifact.

**Trigger:** push a tag like `mobile-v0.1.0`, or run manually via workflow_dispatch.

### Required GitHub secrets

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded upload keystore (see below) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g. `hc-android`) |
| `ANDROID_KEY_PASSWORD` | Key password |

The workflow produces an AAB artifact you can download from the Actions run page and upload to Play Console manually.

To generate the base64 string for `ANDROID_KEYSTORE_BASE64`:

```bash
# macOS / Linux
base64 -i hc-android-key.keystore

# PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("hc-android-key.keystore"))
```

### Auto-upload to Google Play

The workflow includes a commented-out step to upload directly to Play Store. To enable it:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a service account and download the JSON key.
2. In [Google Play Console](https://play.google.com/console/) → **Setup → API access**, link the service account and grant **Release manager** permission.
3. Add the JSON key contents as the `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret in GitHub.
4. Uncomment the "Upload to Google Play" step in the workflow.

---

**Custom native module** — `modules/superman/`:
Exposes TCP/UDP sockets, disk info, thumbnail generation, file system access, and storage permissions to JS. Platform code lives in `android/` and `ios/`.

**App structure:**

| Path | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout — init, theme, modals |
| `app/(tabs)/` | Tab navigation — Home, Photos, Files |
| `app/welcome.tsx` | Onboarding screen |
| `app/login.tsx` | Email + OTP login |
| `app/settings.tsx` | Settings |
| `lib/` | Service implementations, init, permissions, crypto |
| `hooks/` | App state, discovery, photos, permissions, system state |
| `components/` | Reusable UI components |
