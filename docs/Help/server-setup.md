# Server Setup

Run HomeCloud as a headless server.

## What is HomeCloud Server?

HomeCloud Server runs as a headless peer on your network. Once linked to your account, your other HomeCloud devices (desktop app, mobile app) can:

- Browse and store files.
- Backup your photos to the server.
- Use the terminal remotely.
- Run automations and AI agents in background.

## Prerequisites

Currently we only support Linux, we do not currently test or officially support other platforms.

The server needs a few system packages. On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y build-essential python3 ffmpegthumbnailer imagemagick
```

- `build-essential` and `python3` — required to compile the `node-pty` native addon (no prebuilt Linux binary is published).
- `ffmpegthumbnailer` and/or `imagemagick` — used for generating file thumbnails. If neither is installed, the server still runs but thumbnails will be disabled (a warning is logged). Any one of `ffmpegthumbnailer`, `convert` (ImageMagick), or `gnome-thumbnail-factory` is sufficient.

## Step 1: Generate Credentials

Before running the server, you need to link it to your HomeCloud account. Run the credential generator:

```bash
npx @asrient/create-homecloud-creds
```

This will walk you through signing in and produce a `creds.json` file. Keep this file safe, it contains the keys that identify your server to your account.

## Step 2: Run the Server

### Option 1: Running in terminal

```bash
npx @asrient/homecloud-server -p your-passphrase -c ./creds.json
```

Or with environment variables:

```bash
PASSPHRASE=your-passphrase CREDS_PATH=./creds.json npx @asrient/homecloud-server
```

### Option 2: Run in the Background

To keep the server running after you close the terminal (or across reboots), use these commands:

```bash
# Start detached
npx @asrient/homecloud-server start -p your-passphrase -c ./creds.json

# Tail logs
npx @asrient/homecloud-server logs

# Stop / restart / status
npx @asrient/homecloud-server stop
npx @asrient/homecloud-server restart
npx @asrient/homecloud-server status

# Remove from PM2
npx @asrient/homecloud-server delete
```

To restart automatically on system boot, follow the [PM2 startup guide](https://pm2.keymetrics.io/docs/usage/startup/) (`pm2 startup` + `pm2 save`).

## Configuration Options

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

- **7736/tcp**: P2P connections and local network discovery

Make sure this port is accessible if you want other devices on your local network to discover the server automatically.

## FAQ

**Server not showing up on other devices?**
- Ensure the server is running and signed into the same account.
- Check that port 7736 is not blocked by a firewall.

**Can I run the server on a Raspberry Pi?**
- Yes. As long as Node.js 20+ is available, the server runs on any platform including ARM devices like Raspberry Pi.

**How do I update the server?**
- If using npx, it pulls the latest version automatically. You can also run `npx @asrient/homecloud-server@latest` to be explicit.
- If running in the background via `start`, run `npx @asrient/homecloud-server@latest restart` after the new version is available.

**Is the server always reachable remotely?**
- Yes, as long as the server is online and signed into your account, your other devices can reach it over the internet using peer-to-peer connections even across different networks.
