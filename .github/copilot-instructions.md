# Copilot Instructions for HomeCloud

## Architecture

HomeCloud is a TypeScript monorepo for peer-to-peer multi-device connectivity (file access, clipboard sharing, media control, etc.) without cloud storage.

**Packages:**

- **`appShared/`** — Core library: abstract service interfaces, RPC protocol, crypto, discovery, types. Compiles to `dist/` and is consumed by all other packages as `"shared"`.
- **`web/`** — Next.js 15 frontend for the desktop Electron app (React 18, Tailwind, shadcn/ui New York style, Radix UI). Statically exported to `out/` and loaded inside Electron — not a standalone website.
- **`mobile/`** — Expo SDK 54 app (React Native, Expo Router v6 file-based routing). Has a custom native module `modules/superman/` (Kotlin + Swift) for TCP/UDP sockets, file system access, and thumbnails.
- **`desktop/`** — Electron 38 app via electron-forge. Includes C++/Objective-C native addons in `addons/` built with node-gyp. The `web/` package provides its UI — Electron loads the static export from `web/out/`.
- **`authServer/`** — Express 5 API + WebSocket broker. MongoDB, Redis, JWT auth, Zod validation. Brokers P2P connections and manages accounts — never relays user data.

**Key dependency flow:** `appShared` → (`web` → `desktop`, `mobile`) → `authServer` (at runtime via network). The `web` package is not deployed independently — it only serves as the desktop app's renderer UI.

## Build & Run

**Always build `appShared` first** — all other packages depend on its `dist/` output.

```sh
cd appShared && npm install && npm run watch   # keep running during development
```

Then start the package you're working on:

| Package | Dev command | Notes |
|---------|------------|-------|
| web | `cd web && npm install && npm run dev` | Next.js with Turbo |
| desktop | `cd desktop && npm install && npm run build && npm start` | `build` compiles native addons via node-gyp, `start` runs tsc + electron-forge |
| mobile (iOS) | `cd mobile && npm install && npm run ios` | Requires Xcode 15+ |
| mobile (Android) | `cd mobile && npm install && npm run android` | Requires Android SDK 36 |
| authServer | `cd authServer && npm install && npm run dev` | nodemon, needs MongoDB + Redis |

**Linting:**

```sh
cd web && npm run lint          # next lint (ESLint + Next.js core-web-vitals)
```

**Desktop native addon rebuild:**

```sh
cd desktop && node-gyp configure && node-gyp build
```

**Mobile native rebuild** (after changing native module config):

```sh
cd mobile && npm run prebuild   # expo prebuild --clean
```

## ServiceController & RPC Architecture

All platforms (desktop, mobile) share the same layered architecture defined in `appShared`. Each platform only overrides what's necessary — the core RPC, proxy, and service logic is 100% shared.

### Layers (top to bottom)

1. **ServiceController** (`controller.ts`) — Singleton per device. Aggregates all services (`net`, `app`, `system`, `files`, `photos`, `thumbnail`, `account`, `apps`). Each platform extends this class (e.g., `DesktopServiceController`) adding platform-specific service implementations.

2. **RPCControllerProxy** (`servicePrimatives.ts`) — Uses JavaScript `Proxy` to intercept property access on a `ServiceController` instance. Method calls on a remote controller transparently become RPC calls; signal subscriptions become remote subscriptions. This is what makes `remoteController.files.listDir(path)` look identical to a local call.

3. **RPCPeer** (`rpc.ts`) — Transport-agnostic binary RPC protocol. Only requires a `GenericDataChannel` (send/receive bytes). Handles framing via `DataChannelParser` (6-byte header: type + flags + uint32 length), request/response correlation via call IDs, streaming (STREAM_CHUNK/END/CANCEL), auth handshake (HELLO → AUTH_CHALLENGE → AUTH_RESPONSE → READY), signal pub/sub, keepalive pings, and AES-256-CTR encryption post-auth. See `docs/Development/rpc.md` for the wire format spec.

4. **ConnectionInterface** (`netService.ts`) — Abstract transport. Implementations must provide:
   - `connect(candidate: PeerCandidate) → GenericDataChannel`
   - `getCandidates(fingerprint?) → PeerCandidate[]`
   - `onIncomingConnection(callback)`
   - `onCandidateAvailable(callback)`

5. **Concrete transports:**
   - **Local (TCP):** `TCPInterface` — Desktop uses `node:net`, mobile uses the `superman` native module. Discovered via mDNS/Bonjour.
   - **Web (UDP):** `WebcInterface` — Reliable UDP via the auth server relay for NAT traversal. Desktop uses `node:dgram`, mobile uses `superman` UDP. Uses `reUdpProtocol.ts` (SACK, adaptive RTO, AIMD congestion control).

### GenericDataChannel

The interface that all transports must satisfy — this is the abstraction boundary between the RPC protocol and the network:

```typescript
interface GenericDataChannel {
    send(data: Uint8Array): Promise<void>;
    onmessage: (data: Uint8Array) => void;
    disconnect(): void;
    onerror: (err: Error | string) => void;
    ondisconnect: (err?: Error) => void;
}
```

### Connection Candidates & NetService

`NetService` is the connection manager. It maintains:

- **`connectionInterfaces`** — Registered transports (local TCP + web UDP)
- **`connections`** — Primary active connection per peer fingerprint
- **`standbyConnections`** — Secondary connections (e.g., a UDP connection when TCP is primary). When a higher-priority connection arrives, it becomes primary and the old one moves to standby. Standby connections close gracefully once both sides agree and no streams are active.
- **`availableCandidates`** — Pool of `PeerCandidate` entries (with expiry) from all sources: mDNS discovery, relay server, cached addresses, and broker requests

When `getRemoteServiceController(fingerprint)` is called:
1. Return existing connection if one exists
2. Gather candidates from all transports + cache, sorted by priority (local > web)
3. Try each candidate in order — first successful `GenericDataChannel` wins
4. Wrap in `RPCPeer` → `RPCControllerProxy` → return as a `ServiceController`
5. If all fail, request the auth server to broker a connection (tells the remote peer to connect back)

### Service Decorators

```typescript
@exposed       // Required for any method callable via RPC
@allowAll      // Allows all authenticated peers (otherwise access-checked)
@withContext    // Injects MethodContext (fingerprint, connectionType, peerInfo) as first arg
```

### Module Injection

Each platform calls `setModules()` at startup to inject its implementations (crypto, storage, service controller class) into the shared global. The Electron renderer accesses these via `window.modules` (exposed through the preload script via `@electron/remote`).

### Signal System

Services expose `Signal` instances for reactive push updates. When a remote client subscribes (via proxy interception), the server forwards signal dispatches as `SIGNAL_EVENT` RPC frames. This avoids polling — e.g., battery level changes, clipboard updates, and peer status are all pushed in real-time.

## Code Sharing Pattern

All apps import shared code as `"shared"` which resolves to `../appShared/dist/`:

```typescript
import { PeerInfo } from 'shared/types';
import { setModules, ModulesType } from 'shared/modules';
```

Each app provides platform-specific implementations of abstract interfaces defined in `appShared`:

- **`CryptoModule`** — Desktop uses Node.js `crypto`, mobile uses Expo crypto APIs
- **`ConfigStorage`** — Desktop uses file-based storage, mobile uses AsyncStorage
- **`ServiceController`** — Each platform extends the base, wiring in its own service implementations
- **Service interfaces** (`FilesService`, `PhotosService`, `SystemService`, etc.) — implemented per-platform in `lib/services/` or `src/services/`

## Key Conventions

### UI Stack

- **Web (desktop renderer):** shadcn/ui (New York style) + Radix UI primitives + Tailwind CSS with HSL CSS variables. Theme adapts to OS (macOS San Francisco sizing vs Windows/Linux defaults). Components in `web/components/ui/`.
- **Mobile:** Custom `UI*` component library (`mobile/components/ui/` — `UIButton`, `UIText`, `UIView`, etc.) with platform-specific variants (`.ios.tsx`). Uses `useThemeColor()` hook for dynamic theming.

### State Management

- **Web:** React Context + `useReducer` in `web/lib/state.ts`, plus Zustand for isolated stores (e.g., onboarding).
- **Mobile:** Zustand store in `mobile/hooks/useAppState.ts`.
- **Desktop main process:** Singleton `DesktopServiceController` — no UI state framework.

### Native Code

- **Desktop addons** (`desktop/addons/`): Platform-conditional C++/ObjC files compiled via `binding.gyp`. macOS: `*Mac.mm`, Windows: `*Win.cpp`. No empty stubs — files only exist for their target platform.
- **Mobile native module** (`mobile/modules/superman/`): Expo module with Kotlin (Android) and Swift (iOS) implementations for TCP/UDP, thumbnails, file system, and permissions.

### Environment Variables

- Web: `NEXT_PUBLIC_*` prefix (e.g., `NEXT_PUBLIC_API_BASE_URL`)
- Mobile: `EXPO_PUBLIC_*` prefix (e.g., `EXPO_PUBLIC_SERVER_URL`)
- Desktop: `SERVER_URL`, `WS_SERVER_URL` (baked into `dist/env.js` at package time)
- AuthServer: `MONGO_DB_URL`, `SECRET_KEY`, `REDIS_URL`, `AZ_CS_CONNECTION_STRING`, `PORT` (default 4000)

### Releasing

Each package has `npm run release` which bumps the version and creates a git tag. Tag prefixes trigger CI workflows:

- `desktop-v*` → desktop-publish.yml (macOS arm64/universal, Windows x64)
- `mobile-v*` → android-release.yml (signed AAB)
- `auth-v*` → docker-image.yml (Docker Hub push)

CI validates that the tag version matches the package's `package.json` version.
