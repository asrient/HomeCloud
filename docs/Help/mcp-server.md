# MCP Server

HomeCloud includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets external MCP clients interact with your devices through HomeCloud's automation environment.

## What is MCP?

MCP is an open protocol that allows compatible clients to discover and use tools provided by external servers. When enabled, HomeCloud exposes a local MCP server with a scripting tool that can read files, control devices, run automations, and more through your HomeCloud setup.

## Enabling the MCP Server

1. Open **Settings → Artificial Intelligence**.
2. Toggle **"Allow access to HomeCloud"** to start the MCP server.
3. The server URL will be displayed (e.g., `http://127.0.0.1:9637`).

The MCP server runs on localhost only and is not accessible from the network.

### Auto-Start

Once enabled, the MCP server can start automatically when HomeCloud launches so configured clients can connect whenever HomeCloud is running.

## Connecting an MCP Client

Configure any MCP-compatible client to use the URL shown in **Settings → Automation**. The client can then discover and call HomeCloud's automation tools.

## Technical Details

| Detail | Value |
|--------|-------|
| Address | `127.0.0.1` |
| Default port | `9637` |
| Protocol | JSON-RPC 2.0 over HTTP |
| MCP spec | 2025-11-25 |
