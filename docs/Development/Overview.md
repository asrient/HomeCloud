# Development Guide

HomeCloud is a TypeScript monorepo with multiple sub-projects that share a common core library. This guide covers the architecture and how to get each part running locally.

## Architecture

```
HomeCloud/
├── appShared/    # Shared core library (TypeScript, no runtime deps)
├── desktop/      # Electron app (macOS, Windows, Linux)
├── mobile/       # React Native / Expo app (Android, iOS)
├── web/          # Next.js frontend (embedded in desktop app)
├── authServer/   # Auth & connection broker (Express + WebSocket)
├── docs/         # Documentation
└── tools/        # Utility scripts
```

`appShared` is the foundation. It defines services, the RPC protocol, mDNS discovery, and crypto primitives. Both `desktop` and `mobile` implement these abstract services with platform-specific code. The `web` frontend is a Next.js static site that gets embedded into the desktop Electron app. The `authServer` handles account management and connection brokering.

## Prerequisites

- **Node.js** 18+
- **npm**
- **For desktop:** Python 3 + C++ build tools (for native addons via node-gyp)
- **For mobile:** Xcode 15+ (iOS), Android Studio with SDK 36 (Android)

## appShared — Core Library

Platform-agnostic TypeScript library consumed by all other packages. Defines abstract service interfaces (files, photos, system, thumbnails, networking, accounts), the RPC protocol, mDNS discovery, and cryptographic identity.

```bash
cd appShared
npm install
npm run tsc        # one-time build → outputs to dist/
npm run watch      # watch mode for development
```

**always build appShared first** before working on anything else.

## Desktop — Electron App

See [desktop](desktop) for full details, native addons, web frontend, services, and release instructions.

## Mobile — React Native / Expo

See [mobile](mobile) for full details, native module, and app structure.

## Auth Server

See [auth-server](auth-server) for full details, Docker, Docker Compose, and release instructions.

## Full Development Workflow

1. **Build appShared** (run `npm run watch` to keep it rebuilding on changes):
   ```bash
   cd appShared
   npm install
   npm run watch
   ```

2. **Start the platform you're working on:**
   ```bash
   # Desktop UI (if building desktop)
   cd web
   npm run dev

   # Desktop
   cd desktop
   npm start

   # Mobile
   cd mobile
   npm run ios # or android
   ```

3. **Auth server** (if testing account/remote features):
   ```bash
   cd authServer
   npm run dev
   ```

Ensure `.env` / `.env.local` files are configured with the correct server URLs for your environment.
