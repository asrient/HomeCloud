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
