# @asrient/homecloud-server

Run [HomeCloud](https://github.com/asrient/HomeCloud) as a headless server.

## Quick Start

Currently we only support Linux. Though it might run on other platforms as well with limited capability we do not currently test or officially support them.

### Prerequisites

On Linux, the server needs a few system packages. On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y build-essential python3 ffmpegthumbnailer imagemagick
```

- `build-essential` and `python3` — required to compile the `node-pty` native addon (no prebuilt Linux binary is published).
- `ffmpegthumbnailer` and/or `imagemagick` — used for generating file thumbnails. If neither is installed, the server still runs but thumbnails will be disabled (a warning is logged). Any one of `ffmpegthumbnailer`, `convert` (ImageMagick), or `gnome-thumbnail-factory` is sufficient.

macOS and Windows users don't need this step — native modules ship with prebuilt binaries and the OS provides thumbnail generation.

### 1. Generate credentials

```bash
npx @asrient/create-homecloud-creds
```

This links your server to your HomeCloud account and creates a `creds.json` file.

### 2. Run the server

```bash
npx @asrient/homecloud-server -p your-passphrase -c ./creds.json
```

Or with environment variables:

```bash
PASSPHRASE=your-passphrase CREDS_PATH=./creds.json npx @asrient/homecloud-server
```

## Docker

> **Use `--network host`** — HomeCloud uses UDP hole punching for peer-to-peer relay connections. Docker's default bridge networking adds a second NAT layer that breaks hole punching. Host networking lets the container share the host's network stack directly, so both TCP discovery (port 7736) and UDP relay work correctly.

```bash
docker run -d --network host \
  -v /path/to/data:/data \
  -v /path/to/creds.json:/creds.json \
  -e PASSPHRASE=your-passphrase \
  -e CREDS_PATH=/creds.json \
  -e DEVICE_NAME="My Server" \
  asrient/homecloud-server
```

Or with base64 credentials:

```bash
docker run -d --network host \
  -v /path/to/data:/data \
  -e PASSPHRASE=your-passphrase \
  -e CREDS_BASE64=<base64-string> \
  -e DEVICE_NAME="My Server" \
  asrient/homecloud-server
```

## Options

All options can be passed as CLI arguments or environment variables. CLI arguments take precedence.

| CLI arg | Short | Env var | Required | Description |
|---------|-------|---------|----------|-------------|
| `--passphrase` | `-p` | `PASSPHRASE` | Yes | Passphrase used when generating credentials |
| `--creds` | `-c` | `CREDS_PATH` | One of these | Path to the `creds.json` file |
| `--creds-base64` | | `CREDS_BASE64` | One of these | Base64-encoded credentials string |
| `--name` | `-n` | `DEVICE_NAME` | No | Display name for this server (default: OS hostname) |
| `--data-dir` | `-d` | `HC_DATA_DIR` | No | Data directory (default: `~/.hcServerData`) |
| `--cache-dir` | | `HC_CACHE_DIR` | No | Cache directory (default: system temp) |
| `--port` | | `TCP_PORT` | No | TCP port for P2P connections (default: 7736) |
| `--api-url` | | `API_SERVER_URL` | No | API server URL |

## Ports

- **7736/tcp** — P2P connections (local network discovery)

## What it does

HomeCloud Server runs as a headless peer on your network. Once linked to your account, your other HomeCloud devices (desktop app, mobile app) can:

- Browse and transfer files
- Access photos
- Control media playback
- Share clipboard
- Use the terminal remotely

## Links

- [HomeCloud](https://github.com/asrient/HomeCloud) — Main repository
- [@asrient/create-homecloud-creds](https://www.npmjs.com/package/@asrient/create-homecloud-creds) — Credential generator
