# AI Agent

HomeCloud can connect to an AI coding assistant and let it interact with your devices. Chat with the agent, give it tasks, and let it use HomeCloud's tools to automate work across your devices.

## Setting Up an Agent

1. Open **Settings → Artificial Intelligence → AI Agent**.
2. Choose a preset or configure a custom agent:

### Presets

HomeCloud includes presets for popular AI assistants:

| Agent | Command | Arguments |
|-------|---------|-----------|
| GitHub Copilot | `copilot` | `--acp` |
| Claude Code | `npx` | `-y @anthropic-ai/claude-code --acp` |
| Gemini CLI | `npx` | `-y @anthropic-ai/claude-code --acp` |
| Codex CLI | `npx` | `-y @openai/codex --acp` |
| Augment Code | `npx` | `-y @anthropic-ai/claude-code --acp` |

### Custom Configuration

| Field | Description |
|-------|-------------|
| Name | Display name for the agent |
| Command | Executable path (e.g., `copilot`, `npx`) |
| Arguments | CLI arguments (space-separated) |
| Environment variables | Optional key-value pairs passed to the agent process |
| Provide workflow tools | Give the agent access to HomeCloud via the [MCP server](mcp-server) |

The agent must support the **ACP (Agent Communication Protocol)** — a JSON-RPC 2.0 protocol over stdio.

## Using the Agent

### Starting a Chat

1. Go to the **Agent** page.
2. Click **New Chat**.
3. Choose a working directory for the chat session.
4. Start typing your request.

Each chat is an independent session with its own context and working directory.

### Chat Interface

The chat view shows:

- **Messages** — Your prompts and the agent's responses (with markdown support)
- **Thoughts** — The agent's internal reasoning (when provided)
- **Tool calls** — Actions the agent is taking, with status indicators
- **Plans** — Step-by-step plans the agent generates

You can cancel an in-progress response at any time.

### Chat Status

Chats are organized by status:

| Status | Meaning |
|--------|---------|
| Idle | Waiting for input |
| Working | Agent is processing |
| Asking | Agent needs your permission |
| Error | Something went wrong |

On the web, chats are displayed in a kanban board layout grouped by these statuses.

### Permissions

When the agent wants to perform a sensitive operation, it will ask for your permission. You'll see a prompt with options:

- **Allow once** — Permit this specific action
- **Allow always** — Permit this type of action going forward
- **Reject once** — Deny this specific action
- **Reject always** — Always deny this type of action

The agent pauses and waits for your decision before proceeding.

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

- **Desktop** (macOS, Windows, Linux)
- **Web** interface
- **Mobile** (iOS, Android)

The agent process runs on the device where HomeCloud is installed. Mobile and web clients connect to the agent through HomeCloud's service layer.
