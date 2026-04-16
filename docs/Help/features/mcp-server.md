# MCP Server

HomeCloud includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server that lets AI assistants interact with your devices through HomeCloud's scripting environment.

## What is MCP?

MCP is an open protocol that allows AI assistants (like GitHub Copilot, Claude, Gemini, etc.) to discover and use tools provided by external servers. When enabled, HomeCloud exposes a local MCP server that gives your AI assistant access to a powerful scripting tool - allowing it to read files, control devices, run automations, and more, all through your HomeCloud setup.

## Enabling the MCP Server

1. Open **Settings → Artificial Intelligence**.
2. Toggle **"Allow access to HomeCloud"** to start the MCP server.
3. The server URL will be displayed (e.g., `http://127.0.0.1:9637`).

The MCP server runs on localhost only and is not accessible from the network.

### Auto-Start

Once enabled, the MCP server can be set to start automatically when HomeCloud launches, so your AI assistant always has access.

## Connecting an AI Agent

To let your configured AI agent use the MCP server:

1. Open **Settings → Artificial Intelligence → AI Agent**.
2. Enable **"Provide workflow tools"** in the agent configuration.

When this is on, HomeCloud passes the MCP server URL to the agent when creating new chat sessions. The agent can then discover and call the available tools.

### Using with External AI Tools

You can also point any MCP-compatible AI tool at the server URL directly.

## Technical Details

| Detail | Value |
|--------|-------|
| Address | `127.0.0.1` |
| Default port | `9637` |
| Protocol | JSON-RPC 2.0 over HTTP |
| MCP spec | 2025-11-25 |
