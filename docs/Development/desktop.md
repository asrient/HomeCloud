# Desktop — Electron App

Electron app with native C++/ObjC addons for platform-specific features (thumbnails, media control, system info). Uses `sequelize` + `sqlite3` for the photo library database, `bonjour-service`/`@homebridge/ciao` for mDNS discovery, and embeds the `web` frontend.

```bash
cd desktop
npm install

# Build native addons (node-gyp)
npm run build

# Run in development
npm start          # compiles TS + launches electron-forge

# Package for distribution
npm run make       # creates platform installer
npm run publish    # publishes to GitHub Releases (draft)
```

> **Note:** Native modules in the sibling `nodeShared/` package (e.g., `node-pty`) are not rebuilt automatically by electron-forge. If you hit errors like `posix_spawnp failed.` or `NODE_MODULE_VERSION` mismatch when starting the app in dev, rebuild them against Electron's ABI:
>
> ```bash
> cd desktop
> ./node_modules/.bin/electron-rebuild -m ../nodeShared -o node-pty -f
> ```
>
> Drop `-o node-pty` to rebuild every native module under `nodeShared/`.

**Native addons** (in `addons/`, built via `binding.gyp`):
- `ThumbnailMac.mm` — macOS thumbnail generation (only built on macOS)
- `ThumbnailWin.cpp` — Windows thumbnail generation (only built on Windows)
- `MediaControlWin.cpp` — Windows media transport controls
- `SystemWin.cpp` — Windows system info
- `DiscoveryWin.cpp` — Windows DNS-SD native discovery
- `DatagramWin.cpp` — WinRT DatagramSocket for MSIX AppContainer
- `AppContainerWin.cpp` — MSIX AppContainer detection

> Platform-specific targets are conditionally defined in `binding.gyp` — Windows addons are only built on Windows, Mac addons only on macOS. No empty stubs are generated on the wrong platform.

**Services** (in `src/services/`):

| Directory | Purpose |
|-----------|---------|
| `files/` | File system driver, file watching, file utils |
| `photos/` | Photo library with SQLite repository, EXIF metadata extraction, asset management |
| `system/` | Device info, battery, clipboard, media control (mac/linux/win), volume control (mac/linux/win) |
| `thumb/` | Thumbnail generation with per-platform generators |
| `discovery.ts` | mDNS/Bonjour peer discovery |
| `tcpInterface.ts` | LAN TCP connections |
| `webcInterface.ts` | Remote connections via auth server |

**Build pipeline:** The desktop build embeds the web frontend by copying `web/out` → `desktop/assets/web` during packaging (handled by `forge.config.js`). Before packaging the desktop app, build the web project first.

## Web — Next.js Frontend

Static-exported Next.js app that serves as the UI for the desktop app. Uses Radix UI, Tailwind CSS, Framer Motion, and Zustand.

```bash
cd web
npm install
npm run dev        # dev server with Turbopack
npm run build      # static export → out/
```

**Pages:**

| Route | Purpose |
|-------|---------|
| `/` | Home — device overview |
| `/files/folder` | File browser |
| `/photos/library` | Photo library |
| `/settings` | Settings |
| `/dev` | Dev tools (development only) |

## Releasing a New Desktop Version

This is a monorepo, so each app has its own versioning scheme with prefixed tags. Desktop uses the `desktop-v` prefix.

1. **Bump the version and create a tag:**
   ```bash
   cd desktop
   npm run release -- <major|minor|patch|x.y.z>
   # e.g. npm run release -- patch       → 1.0.0 → 1.0.1, tag: desktop-v1.0.1
   # e.g. npm run release -- 2.0.0       → tag: desktop-v2.0.0
   ```
   This updates `package.json` and creates a `desktop-v*` git tag automatically.

2. **Push the commit and tag:**
   ```bash
   git push && git push --tags
   ```
   This triggers the **Desktop App CI** workflow, which builds for macOS (arm64 + universal) and Windows (x64), and publishes to GitHub Releases.

> **Note:** The CI validates that the tag version matches `desktop/package.json`. The build will fail if they're out of sync.

## CI Build Matrix

| Runner | Platform | Arch | Output |
|--------|----------|------|--------|
| `macos-latest` | darwin | arm64 | `HomeCloud-macos-arm64.zip` |
| `macos-latest` | darwin | universal | `HomeCloud-macos-universal.zip` |
| `windows-latest` | win32 | x64 | `HomeCloud Setup.exe` |

The universal macOS build produces a fat binary containing both arm64 and x64 slices via `@electron/universal`. Architecture-specific `.node` native addons are merged using `lipo` (configured via `osxUniversal.x64ArchFiles` in `forge.config.js`).

## macOS Code Signing & Notarization (Optional)

Unsigned macOS apps trigger Gatekeeper warnings. To distribute signed and notarized builds, set these GitHub Actions secrets:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded Developer ID Application `.p12` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` |
| `APPLE_ID` | Apple Developer account email |
| `APPLE_ID_PASSWORD` | [App-specific password](https://support.apple.com/en-us/102654) |
| `APPLE_TEAM_ID` | 10-character team ID from developer.apple.com |

**Exporting the certificate:**
```bash
# Export "Developer ID Application" from Keychain Access as .p12, then:
base64 -i Certificates.p12 | pbcopy
# Paste as the APPLE_CERTIFICATE secret value
```

When all secrets are set, the CI automatically signs the app, submits it to Apple for notarization, and staples the ticket. When secrets are absent, signing is silently skipped and unsigned builds are produced.

## Building MSIX for Microsoft Store

MSIX packages are used for Microsoft Store submissions. The build is gated behind the `BUILD_MSIX=true` env var — when set, the MSIX maker replaces the Squirrel installer in the build output.

### Local MSIX build (signed, for sideloading)

Signed MSIX packages can be installed directly on Windows without the Store.

1. **Create a self-signed certificate** (one-time):
   ```powershell
   .\tools\create-dev-cert.ps1
   ```
   This creates `~/HomeCloud.pfx` and `~/HomeCloud.cer` and prints the env vars to use.

2. **Build the signed MSIX:**
   ```powershell
   $env:SERVER_URL = "https://example.com"
   $env:BUILD_MSIX = "true"
   $env:MSIX_CERT_FILE = "$HOME\HomeCloud.pfx"
   $env:MSIX_CERT_PASSWORD = "HomeCloud2026!"
   npm run make
   ```

3. **Install on a target machine:**
   - First, install the certificate: double-click `HomeCloud.cer` → Install → Local Machine → Trusted People.
   - Then double-click the `.msix` file to install.

### MSIX manifest

The MSIX uses a custom `AppxManifest.xml` template (`desktop/msix/AppxManifest.xml`) that declares network capabilities (`privateNetworkClientServer`, `internetClientServer`) needed for mDNS, TCP, and UDP sockets. The manifest is generated during packaging by `generateMsixManifest()` in `forge.config.js` and cleaned up after build.

The Windows SDK path is auto-detected at build time via `getWindowsKitPath()` — it scans installed SDK versions and uses the latest, avoiding mismatches between the manifest's `MinVersion` and the installed SDK.

Custom MSIX assets (icons, tiles) are in `desktop/msix/assets/`.
