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

### 1. Create an upload keystore

```bash
keytool -genkey -v -keystore hc-android-key.keystore -alias hc-android -keyalg RSA -keysize 2048 -validity 10000
```

Move the generated file to your home directory (e.g. `C:\Users\you\hc-android-key.keystore` or `~/hc-android-key.keystore`).

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
