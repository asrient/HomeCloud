# Agent Client Protocol (ACP) — Technical Reference

> Reference document for the HomeCloud AgentService integration. Based on ACP spec v0.18.0 (protocol version 1).
> Source: [agentclientprotocol.com](https://agentclientprotocol.com) · [TypeScript SDK](https://www.npmjs.com/package/@agentclientprotocol/sdk) · [Schema](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/schema/schema.json)

---

## 1. What ACP Is

ACP (Agent Client Protocol) standardizes communication between **code editors/IDEs** (Clients) and **AI coding agents** (Agents). Think LSP, but for AI agents instead of language servers.

- **Wire format:** JSON-RPC 2.0 over stdio (newline-delimited JSON)
- **Transport:** stdio for local agents (subprocess), HTTP/WS for remote (work in progress)
- **Connection model:** One connection supports multiple concurrent sessions
- **Direction:** Bidirectional — both sides can send requests and notifications

### Who's Who

| Role | Description | Examples |
|------|-------------|---------|
| **Agent** | AI coding program (runs as subprocess) | OpenCode, Gemini CLI, Copilot CLI, Claude Agent, Cursor CLI, Cline, Goose, Qwen Code |
| **Client** | Editor/UI that manages the agent | Zed, VS Code (via extensions), JetBrains, our HomeCloud AgentService |

### Key Design Principles

1. **MCP-friendly** — reuses MCP types for content blocks, resources, tool schemas
2. **UX-first** — designed for rich coding UX (diffs, plans, tool calls, permissions)
3. **Trusted** — assumes you trust the agent (but still have permission controls)
4. **Capability-negotiated** — everything is opt-in via capabilities

---

## 2. Protocol Lifecycle

```
Client                                          Agent (subprocess)
  │                                                │
  │─── initialize ────────────────────────────────>│  Phase 1: Handshake
  │<── initialize response (capabilities) ────────│
  │                                                │
  │─── authenticate (if agent requires it) ──────>│  Phase 1b: Auth (optional)
  │<── authenticate response ─────────────────────│
  │                                                │
  │─── session/new { cwd, mcpServers } ──────────>│  Phase 2: Session Setup
  │<── { sessionId, modes?, configOptions? } ─────│
  │                                                │
  │─── session/prompt { sessionId, prompt } ─────>│  Phase 3: Prompt Turn
  │<── session/update (plan) ─────────────────────│  ← notification
  │<── session/update (agent_message_chunk) ──────│  ← notification
  │<── session/update (tool_call) ────────────────│  ← notification
  │<── session/request_permission ────────────────│  ← request FROM agent
  │─── permission response { optionId } ─────────>│
  │<── session/update (tool_call_update) ─────────│  ← notification
  │<── session/update (agent_message_chunk) ──────│  ← notification
  │<── session/prompt response { stopReason } ────│  Turn complete
  │                                                │
  │─── session/cancel ───────────────────────────>│  (notification, can interrupt)
  │                                                │
  │─── session/list ─────────────────────────────>│  Phase 4: Session Management
  │<── { sessions: SessionInfo[] } ───────────────│
  │─── session/load { sessionId } ───────────────>│  (replays history as updates)
  │<── session/update (user_message_chunk) ───────│
  │<── session/update (agent_message_chunk) ──────│
  │<── session/load response ─────────────────────│
```

---

## 3. Initialization

### Request (Client → Agent)

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "method": "initialize",
  "params": {
    "protocolVersion": 1,
    "clientCapabilities": {
      "fs": { "readTextFile": true, "writeTextFile": true },
      "terminal": true
    },
    "clientInfo": { "name": "homecloud", "title": "HomeCloud", "version": "1.0.0" }
  }
}
```

### Response (Agent → Client)

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": 1,
    "agentCapabilities": {
      "loadSession": true,
      "promptCapabilities": { "image": true, "audio": false, "embeddedContext": true },
      "mcpCapabilities": { "http": true, "sse": false },
      "sessionCapabilities": { "list": {}, "close": {}, "resume": {}, "fork": {} }
    },
    "agentInfo": { "name": "opencode", "title": "OpenCode", "version": "0.5.0" },
    "authMethods": []
  }
}
```

### Client Capabilities

| Capability | What it enables |
|---|---|
| `fs.readTextFile` | Agent can call `fs/read_text_file` to read files (including unsaved editor state) |
| `fs.writeTextFile` | Agent can call `fs/write_text_file` to write files |
| `terminal` | Agent can call `terminal/create`, `terminal/output`, `terminal/wait_for_exit`, `terminal/kill`, `terminal/release` |

### Agent Capabilities

| Capability | What it means |
|---|---|
| `loadSession` | `session/load` is available (resume previous conversations) |
| `promptCapabilities.image` | Prompts can include image content blocks |
| `promptCapabilities.audio` | Prompts can include audio content blocks |
| `promptCapabilities.embeddedContext` | Prompts can include embedded resource content blocks |
| `mcpCapabilities.http` | Agent supports HTTP-transport MCP servers |
| `mcpCapabilities.sse` | Agent supports SSE-transport MCP servers (deprecated by MCP) |
| `sessionCapabilities.list` | `session/list` is available |
| `sessionCapabilities.close` | `session/close` is available (unstable) |
| `sessionCapabilities.resume` | `session/resume` is available (unstable) |
| `sessionCapabilities.fork` | `session/fork` is available (unstable) |

### Version Negotiation

- Client sends its highest supported version
- Agent responds with the same version if supported, or its highest version
- If they disagree, client should close the connection

---

## 4. Authentication

Agents MAY require authentication. The `initialize` response includes `authMethods`:

```json
"authMethods": [
  { "id": "env_var", "type": "env_var", "envVarName": "ANTHROPIC_API_KEY" },
  { "id": "terminal", "type": "terminal" },
  { "id": "agent", "type": "agent" }
]
```

| Auth Method | How it works |
|---|---|
| `env_var` | Client provides the env var value directly |
| `terminal` | Agent handles auth via terminal interaction (OAuth flow etc.) |
| `agent` | Agent handles auth internally |

Client calls `authenticate` with the chosen method ID. If `authMethods` is empty, no auth needed.

---

## 5. Sessions

### The Agent Owns Sessions

This is critical: **the agent persists, lists, loads, and manages its own sessions.** The client is a view layer.

### Creating a Session

```json
// Request
{ "method": "session/new", "params": { "cwd": "/path/to/project", "mcpServers": [...] } }

// Response
{
  "sessionId": "sess_abc123",
  "modes": { "currentModeId": "ask", "availableModes": [...] },
  "configOptions": [...]
}
```

The response may include:
- `modes` — available operating modes (ask, code, architect, etc.)
- `configOptions` — arbitrary configuration selectors (model, mode, thinking level)
- Both are optional. `configOptions` supersedes `modes`.

### Listing Sessions

Capability-gated: requires `sessionCapabilities.list`.

```json
// Request
{ "method": "session/list", "params": { "cwd": "/path/to/project", "cursor": null } }

// Response
{
  "sessions": [
    { "sessionId": "sess_abc123", "cwd": "/path/to/project", "title": "Fix auth bug", "updatedAt": "2026-04-01T..." },
    { "sessionId": "sess_def456", "cwd": "/path/to/project", "title": "Add tests" }
  ],
  "nextCursor": "eyJwYWdlIjogMn0="
}
```

Supports cursor-based pagination and `cwd` filtering.

### Loading a Session (Resume with History Replay)

Capability-gated: requires `loadSession`.

```json
{ "method": "session/load", "params": { "sessionId": "sess_abc123", "cwd": "/path/to/project", "mcpServers": [...] } }
```

The agent **replays the entire conversation** as `session/update` notifications:
1. `user_message_chunk` — each user message
2. `agent_message_chunk` — each agent response
3. `tool_call` / `tool_call_update` — tool call history
4. Response when replay is complete

After loading, the client can send new prompts as normal.

### Closing a Session (Unstable)

```json
{ "method": "session/close", "params": { "sessionId": "sess_abc123" } }
```

Agent must cancel any ongoing work and free resources.

### Resuming Without Replay (Unstable)

```json
{ "method": "session/resume", "params": { "sessionId": "sess_abc123", "cwd": "...", "mcpServers": [...] } }
```

Resumes the context without streaming back history. Useful when the client already has the history cached.

### Forking a Session (Unstable)

```json
{ "method": "session/fork", "params": { "sessionId": "sess_abc123" } }
// Response: { "sessionId": "sess_new_forked_id" }
```

Creates a new independent session based on an existing one.

---

## 6. Prompt Turn (The Core Loop)

### Sending a Prompt

```json
{
  "method": "session/prompt",
  "params": {
    "sessionId": "sess_abc123",
    "prompt": [
      { "type": "text", "text": "Fix the bug in auth.ts" },
      { "type": "resource_link", "uri": "file:///path/auth.ts", "name": "auth.ts" }
    ]
  }
}
```

Prompt content can include (based on capabilities):
- `text` — always supported
- `resource_link` — always supported
- `image` — requires `promptCapabilities.image`
- `audio` — requires `promptCapabilities.audio`
- `resource` (embedded) — requires `promptCapabilities.embeddedContext`

### Session Updates (Streamed During Turn)

All streamed via `session/update` notifications. The `sessionUpdate` field discriminates the type:

| sessionUpdate | What it carries |
|---|---|
| `agent_message_chunk` | Agent text response (streamed incrementally) |
| `user_message_chunk` | User message echo (during history replay) |
| `thought_message_chunk` | Agent's reasoning/thinking text |
| `tool_call` | Tool invocation reported (toolCallId, title, kind, status) |
| `tool_call_update` | Tool progress/completion (status, content, diffs, terminals) |
| `plan` | Execution plan (array of `PlanEntry { content, priority, status }`) |
| `usage_update` | Token usage and cost information |
| `session_info_update` | Session metadata changed (title, updatedAt) |
| `available_commands_update` | Slash commands available |
| `current_mode_update` | Agent changed its operating mode |
| `config_option_update` | Config options changed |

### Stop Reasons

When the prompt turn ends, the agent responds with a `stopReason`:

| StopReason | Meaning |
|---|---|
| `end_turn` | Model finished responding naturally |
| `max_tokens` | Token limit reached |
| `max_turn_requests` | Max model requests per turn exceeded |
| `refusal` | Agent refuses to continue |
| `cancelled` | Client cancelled the turn |

### Cancellation

Client sends `session/cancel` (notification, no response):
```json
{ "method": "session/cancel", "params": { "sessionId": "sess_abc123" } }
```

Agent must stop LLM requests, abort tool calls, flush pending updates, then respond to the original `session/prompt` with `stopReason: "cancelled"`.

---

## 7. Tool Calls

### Lifecycle

```
1. tool_call       (status: pending)     — Agent reports LLM wants a tool
2. request_permission (optional)          — Agent asks client for approval
3. tool_call_update (status: in_progress) — Tool is executing
4. tool_call_update (status: completed)   — Tool finished with results
                 or (status: failed)      — Tool errored
```

### Tool Call Kinds

| Kind | Description |
|---|---|
| `read` | Reading files/data |
| `write` | Writing/modifying files |
| `execute` | Running commands |
| `search` | Searching codebase/web |
| `browser` | Browser automation |
| `switch_mode` | Switching operating mode |
| `mcp` | MCP tool invocation |
| `other` | Anything else |

### Tool Call Content Types

| Type | Description |
|---|---|
| `content` | Regular content block (text, image, resource) |
| `diff` | File modification: `{ path, oldText, newText }` |
| `terminal` | Live terminal output: `{ terminalId }` |

### Permission Request (Agent → Client)

```json
{
  "method": "session/request_permission",
  "params": {
    "sessionId": "sess_abc123",
    "toolCall": { "toolCallId": "call_001", "title": "Delete auth.ts", "kind": "write", "status": "pending" },
    "options": [
      { "optionId": "allow-once", "name": "Allow once", "kind": "allow_once" },
      { "optionId": "allow-always", "name": "Always allow", "kind": "allow_always" },
      { "optionId": "reject", "name": "Reject", "kind": "reject_once" }
    ]
  }
}
```

**This is a JSON-RPC request FROM the agent TO the client.** The client must respond:

```json
{ "result": { "outcome": { "outcome": "selected", "optionId": "allow-once" } } }
// OR on cancellation:
{ "result": { "outcome": { "outcome": "cancelled" } } }
```

The agent blocks until the client responds. If turn is cancelled, client must respond with `cancelled`.

### Permission Option Kinds

| Kind | Meaning |
|---|---|
| `allow_once` | Allow this operation only this time |
| `allow_always` | Allow and remember the choice |
| `reject_once` | Reject only this time |
| `reject_always` | Reject and remember the choice |

---

## 8. Client-Side Methods (Agent Calls Client)

These are requests the **agent** sends to the **client**, and the client must implement if it advertised the capability.

### File System

| Method | Capability | Purpose |
|---|---|---|
| `fs/read_text_file` | `fs.readTextFile` | Read file content (supports line range). Can include unsaved editor state. |
| `fs/write_text_file` | `fs.writeTextFile` | Write/create file. Client must create if missing. |

`fs/read_text_file` params: `{ sessionId, path, line?, limit? }` → `{ content }`

`fs/write_text_file` params: `{ sessionId, path, content }` → `null`

### Terminals

| Method | Capability | Purpose |
|---|---|---|
| `terminal/create` | `terminal` | Start a command. Returns `terminalId` immediately (async). |
| `terminal/output` | `terminal` | Get current terminal output + exit status if finished. |
| `terminal/wait_for_exit` | `terminal` | Block until command completes. Returns exit code. |
| `terminal/kill` | `terminal` | Kill the command (terminal stays valid for output retrieval). |
| `terminal/release` | `terminal` | Kill + free all resources. Terminal ID becomes invalid. |

`terminal/create` params: `{ sessionId, command, args?, env?, cwd?, outputByteLimit? }` → `{ terminalId }`

Terminals can be embedded in tool call content as `{ type: "terminal", terminalId }` for live output display.

### Permission

| Method | Always available | Purpose |
|---|---|---|
| `session/request_permission` | Yes (baseline) | Ask user to approve/reject a tool call. |

---

## 9. Session Modes & Config Options

### Modes (Being Superseded)

Agents can offer operating modes (e.g., `ask`, `code`, `architect`). Returned in `session/new` response.

```json
"modes": {
  "currentModeId": "ask",
  "availableModes": [
    { "id": "ask", "name": "Ask", "description": "Request permission before changes" },
    { "id": "code", "name": "Code", "description": "Full tool access" },
    { "id": "architect", "name": "Architect", "description": "Design without implementation" }
  ]
}
```

Client switches with `session/set_mode`. Agent can also switch autonomously and notify via `current_mode_update`.

### Config Options (Preferred, Supersedes Modes)

More flexible — arbitrary selectors for model, mode, thinking level, etc.

```json
"configOptions": [
  {
    "id": "mode", "name": "Session Mode", "category": "mode", "type": "select",
    "currentValue": "ask",
    "options": [
      { "value": "ask", "name": "Ask" },
      { "value": "code", "name": "Code" }
    ]
  },
  {
    "id": "model", "name": "Model", "category": "model", "type": "select",
    "currentValue": "model-1",
    "options": [
      { "value": "model-1", "name": "Fast Model" },
      { "value": "model-2", "name": "Powerful Model" }
    ]
  }
]
```

Client changes with `session/set_config_option`. Response returns the **full** config state (changing one may affect others).

Reserved categories: `mode`, `model`, `thought_level`. Custom categories start with `_`.

---

## 10. Agent Plan

Agents can share execution plans via `session/update`:

```json
{
  "sessionUpdate": "plan",
  "entries": [
    { "content": "Analyze codebase structure", "priority": "high", "status": "in_progress" },
    { "content": "Identify refactoring targets", "priority": "high", "status": "pending" },
    { "content": "Create unit tests", "priority": "medium", "status": "pending" }
  ]
}
```

- Priority: `high`, `medium`, `low`
- Status: `pending`, `in_progress`, `completed`
- Each update sends the **complete** plan (client replaces, not merges)
- Plans are dynamic — entries can be added/removed/reordered

---

## 11. Slash Commands

Agents can advertise slash commands via `available_commands_update`:

```json
{
  "sessionUpdate": "available_commands_update",
  "availableCommands": [
    { "name": "web", "description": "Search the web", "input": { "hint": "query to search for" } },
    { "name": "test", "description": "Run tests for the current project" },
    { "name": "plan", "description": "Create implementation plan", "input": { "hint": "what to plan" } }
  ]
}
```

Commands are sent as regular `session/prompt` messages with a `/` prefix:
```json
{ "prompt": [{ "type": "text", "text": "/web agent client protocol" }] }
```

Command list can update dynamically during a session.

---

## 12. Content Types (Shared with MCP)

| Type | Direction | Description |
|---|---|---|
| `text` | Prompt + Update | Plain text (always supported in prompts) |
| `image` | Prompt + Update | Base64 PNG/JPEG (requires `image` capability for prompts) |
| `audio` | Prompt | Base64 WAV/MP3 (requires `audio` capability) |
| `resource` | Prompt | Embedded resource with URI + content (requires `embeddedContext` capability) |
| `resource_link` | Prompt + Update | URI reference to a resource (always supported in prompts) |

---

## 13. Extensibility

### `_meta` Fields

Every type in the protocol includes an optional `_meta: { [key: string]: unknown }` field for custom data. Reserved root keys: `traceparent`, `tracestate`, `baggage` (W3C trace context).

### Extension Methods

Custom JSON-RPC methods must start with `_`:
- Requests: `_zed.dev/workspace/buffers` → expects response
- Notifications: `_zed.dev/file_opened` → fire-and-forget

Unrecognized methods return `-32601 Method not found`. Unrecognized notifications are silently ignored.

### Custom Capabilities

Advertised via `_meta` in capability objects during initialization:
```json
"agentCapabilities": { "_meta": { "zed.dev": { "workspace": true } } }
```

---

## 14. TypeScript SDK

```
npm install @agentclientprotocol/sdk
```

### Key Classes

| Class | Role | Use |
|---|---|---|
| `ClientSideConnection` | **We use this** — wraps a `Stream` and exposes the `Agent` interface | Our code creates this to talk to agent subprocesses |
| `AgentSideConnection` | For building agents — wraps a `Stream` and exposes the `Client` interface | Not relevant for us |
| `ndJsonStream(stdin, stdout)` | Creates a `Stream` from stdio pipes | Used to connect to subprocess |

### ClientSideConnection API

```typescript
import { ClientSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';
import { spawn } from 'child_process';

const child = spawn('opencode', ['--acp']);
const stream = ndJsonStream(child.stdin, child.stdout);

const connection = new ClientSideConnection(
  (agent) => ({
    // Client interface — handle requests FROM the agent:
    requestPermission: async (params) => { /* show UI, return { outcome } */ },
    readTextFile: async (params) => { /* read file, return { content } */ },
    writeTextFile: async (params) => { /* write file */ },
    createTerminal: async (params) => { /* spawn command, return { terminalId } */ },
    terminalOutput: async (params) => { /* return { output, truncated, exitStatus? } */ },
    waitForTerminalExit: async (params) => { /* return { exitCode, signal } */ },
    killTerminal: async (params) => { /* kill process */ },
    releaseTerminal: async (params) => { /* cleanup */ },

    // Notifications FROM agent (no return):
    sessionUpdate: (params) => { /* handle session/update notifications */ },
  }),
  stream
);

// Initialize
const initResult = await connection.initialize({
  protocolVersion: 1,
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
  clientInfo: { name: "homecloud", title: "HomeCloud", version: "1.0.0" }
});
// initResult.agentCapabilities — what this agent supports

// Create session
const session = await connection.newSession({ cwd: "/path/to/project" });
// session.sessionId, session.modes?, session.configOptions?

// Send prompt (blocks until turn completes; updates stream via sessionUpdate callback)
const result = await connection.prompt({
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Fix the authentication bug" }]
});
// result.stopReason === "end_turn" | "cancelled" | "max_tokens" | ...

// List sessions (capability-gated)
const sessions = await connection.listSessions({ cwd: "/path/to/project" });
// sessions.sessions: SessionInfo[]

// Load session (replays history through sessionUpdate callback)
await connection.loadSession({ sessionId: "sess_abc", cwd: "/path", mcpServers: [] });

// Cancel ongoing turn
await connection.cancel({ sessionId: session.sessionId });

// Close session (unstable)
await connection.unstable_closeSession({ sessionId: session.sessionId });

// Connection lifecycle
connection.signal.addEventListener('abort', () => console.log('disconnected'));
await connection.closed; // resolves when connection ends
```

### Stream Type

```typescript
type Stream = {
  readable: ReadableStream<AnyMessage>;
  writable: WritableStream<AnyMessage>;
};
```

`ndJsonStream()` creates this from stdin/stdout. **Any bidirectional stream works** — this is the extension point for future HTTP/WS remote agents.

---

## 15. Compatible Agents (as of April 2026)

| Agent | Developer | ACP Support |
|---|---|---|
| OpenCode | SST | Native |
| Gemini CLI | Google | Native |
| Copilot CLI | GitHub | Public preview |
| Claude Agent | Anthropic | Via Zed adapter |
| Codex CLI | OpenAI | Via Zed adapter |
| Cursor CLI | Cursor | Native |
| Cline | Cline | Native |
| Goose | Block | Native |
| Junie CLI | JetBrains | Native |
| OpenClaw | Community | Native |
| Docker cagent | Docker | Native |
| Kiro CLI | AWS | Native |
| Qwen Code | Alibaba | Native |
| Mistral Vibe | Mistral | Native |

---

## 16. Comparison: ACP vs MCP

| | ACP | MCP |
|---|---|---|
| **Purpose** | Agent ↔ Editor communication | LLM ↔ Tool Server communication |
| **Who calls whom** | Bidirectional (both sides send requests) | Server provides tools, client calls them |
| **Session state** | Agent maintains conversation history | Stateless tool calls |
| **Content types** | Shared with MCP (text, image, resource, etc.) | Defines content types |
| **Transport** | stdio (subprocess), HTTP/WS (WIP) | stdio, HTTP, SSE |
| **UX features** | Plans, diffs, permissions, modes, slash commands | Tools, resources, prompts |
| **Relationship** | ACP agents often connect to MCP servers internally | MCP servers are tool providers |

They're complementary: an ACP agent uses MCP servers as tools. When creating an ACP session, the client can pass MCP server configs so the agent can connect to them.

---

## 17. Protocol Invariants

- All file paths MUST be absolute
- Line numbers are 1-based
- Session IDs are opaque strings (don't parse them)
- Cursors are opaque strings (don't persist them)
- `session/update` notifications can arrive at any time during a prompt turn
- `session/request_permission` blocks the agent until the client responds
- `session/cancel` is a notification (no response), but client MUST respond to all pending `request_permission` calls with `cancelled`
- Agent MUST NOT call client methods it didn't verify in capabilities
- All capabilities not explicitly present are UNSUPPORTED
- `_meta` fields are reserved for extensions; don't add custom root fields to spec types
