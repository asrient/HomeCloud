# @asrient/create-homecloud-creds

Interactive CLI tool to generate credentials for [HomeCloud Server](https://github.com/asrient/HomeCloud).
Run this before you setup your HomeCloud server.

## Usage

```bash
npx @asrient/create-homecloud-creds
```

To setup your HomeCloud server check out https://www.npmjs.com/package/@asrient/homecloud-server

## Output

A `creds.json` file containing the encrypted credentials. Use it to start the HomeCloud server:

```bash
PASSPHRASE=your-passphrase CREDS_PATH=./creds.json homecloud-server
```

Or with the base64 option (useful for Docker/cloud deployments):

```bash
PASSPHRASE=your-passphrase CREDS_BASE64=<base64-string> homecloud-server
```

## Requirements

- Node.js 18+ (uses built-in `fetch`)
