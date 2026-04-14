# Server Setup

Run HomeCloud as a headless server — access your files, photos, and devices from anywhere without needing a desktop or mobile app running.

## What is HomeCloud Server?

HomeCloud Server runs as a headless peer on your network. Once linked to your account, your other HomeCloud devices (desktop app, mobile app) can:

- Browse and transfer files
- Access photos
- Control media playback
- Share clipboard
- Use the terminal remotely

All connections are peer-to-peer — your data never passes through a cloud server.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later (for npx usage), **or** [Docker](https://www.docker.com/)
- A HomeCloud account (sign up through the desktop or mobile app)

## Step 1: Generate Credentials

Before running the server, you need to link it to your HomeCloud account. Run the credential generator:

```bash
npx @asrient/create-homecloud-creds
```

This will walk you through signing in and produce a `creds.json` file. Keep this file safe — it contains the keys that identify your server to your account.

## Step 2: Run the Server

### Using npx

```bash
npx @asrient/homecloud-server -p your-passphrase -c ./creds.json
```

Or with environment variables:

```bash
PASSPHRASE=your-passphrase CREDS_PATH=./creds.json npx @asrient/homecloud-server
```

### Using Docker

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

If you prefer not to mount the credentials file, you can pass it as a base64-encoded string:

```bash
docker run -d --network host \
  -v /path/to/data:/data \
  -e PASSPHRASE=your-passphrase \
  -e CREDS_BASE64=<base64-string> \
  -e DEVICE_NAME="My Server" \
  asrient/homecloud-server
```

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

- **7736/tcp** — P2P connections and local network discovery

Make sure this port is accessible if you want other devices on your local network to discover the server automatically.

## FAQ

**Server not showing up on other devices?**
- Ensure the server is running and signed into the same account.
- Check that port 7736 is not blocked by a firewall.
- If using Docker, make sure you're using `--network host`.

**Can I run the server on a Raspberry Pi?**
- Yes. As long as Node.js 18+ is available, the server runs on any platform including ARM devices like Raspberry Pi.

**How do I update the server?**
- If using npx, it pulls the latest version automatically. You can also run `npx @asrient/homecloud-server@latest` to be explicit.
- If using Docker, pull the latest image: `docker pull asrient/homecloud-server` and recreate the container.

**Is the server always reachable remotely?**
- Yes, as long as the server is online and signed into your account, your other devices can reach it over the internet using peer-to-peer connections — even across different networks.
