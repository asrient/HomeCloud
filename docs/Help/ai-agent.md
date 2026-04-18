# AI Agent

HomeCloud can connect to an AI assistant and let it interact with your devices. Chat with the agent, give it tasks, and let it use HomeCloud's tools to automate work across your devices.

## Setting Up an Agent

1. Open **Settings → Artificial Intelligence → AI Agent**.
2. Choose a preset or configure a custom agent:

### Presets

HomeCloud includes presets for popular AI assistants including GitHub Copilot, Claude Code, Gemini CLI, Codex CLI.

### Custom Configuration

| Field | Description |
|-------|-------------|
| Name | Display name for the agent |
| Command | Executable path (e.g., `copilot`, `npx`) |
| Arguments | CLI arguments (space-separated) |
| Environment variables | Optional key-value pairs passed to the agent process |
| Provide workflow tools | Give the agent access to HomeCloud via the [MCP server](mcp-server) |

The agent must support the **ACP (Agent Communication Protocol)** over stdio.

## Using the Agent

### Starting a Chat

1. Go to the **Agent** page.
2. Click **New Chat**.
3. Choose a working directory for the chat session.
4. Start the conversation.

Each chat is an independent session that keeps running in the background even when the chat window is closed.

### Chat Status

Chats are organized by status:

| Status | Meaning |
|--------|---------|
| Idle | Waiting for input |
| Working | Agent is processing |
| Asking | Agent needs your permission |
| Error | Something went wrong |

On the web, chats are displayed in a kanban board layout grouped by these statuses.

## Workflow Tools

When **"Provide workflow tools"** is enabled in the agent config, the agent gets access to HomeCloud's [MCP server](mcp-server). This lets it:

- Execute JavaScript scripts on your device
- Read and write files on any connected device
- Query device information
- Store and retrieve secrets
- Run existing workflows

This turns the AI agent into a powerful automation tool that can operate across all your HomeCloud devices.

## Chat Configuration

Some agents expose configuration options (like model selection or operation modes) directly in the chat. When available, these appear as settings you can adjust per chat session.

## Availability

The AI agent feature is available on:

- **Desktop** (macOS, Windows)
- **Mobile** (iOS, Android)

The agent process runs on the device where HomeCloud is installed. Mobile and desktop clients connect to the agent through HomeCloud's service layer.
