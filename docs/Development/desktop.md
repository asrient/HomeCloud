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

**Native addons** (in `addons/`):
- `ThumbnailMac.mm` / `ThumbnailWin.cpp` — OS-native thumbnail generation
- `MediaControlWin.cpp` — Windows media transport controls
- `SystemWin.cpp` — Windows system info

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
   This triggers the **Desktop App CI** workflow, which builds for macOS, Linux, and Windows, and publishes to GitHub Releases as a draft.

> **Note:** The CI validates that the tag version matches `desktop/package.json`. The build will fail if they're out of sync.

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

Custom MSIX assets (icons, tiles) are in `desktop/msix/assets/`.
