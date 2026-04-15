# Workflows

Workflows let you automate tasks on your HomeCloud devices using JavaScript. Create scripts that read files, control devices, and run on a schedule or anytime manually.

## Creating a Workflow

1. Go to the **Workflows** page.
2. Click **New Workflow** button.
3. Enter a name and choose where to save the script.
4. HomeCloud creates a starter script you can edit right away.

Each workflow is a JavaScript file that runs in an isolated environment with access to all HomeCloud's device APIs.

## Editing a Workflow

You can configure:

- **Enabled/disabled** — Disable a workflow without deleting it, any trigger for the workflow will be paused.
- **Max execution time** — After this the script run will be stopped and status will be set as timeout.
- **Input fields** — Define parameters that are prompted when running the workflow, provided values can be accessed in the script.
- **Triggers** — Set up automatic schedules to run the script.

## Input Fields

Workflows can define input fields so you (or an AI agent) can pass values at run time. Each field has:

| Property | Description |
|----------|-------------|
| Name | Field identifier |
| Type | `string`, `number`, `boolean`, or `select` |
| Default value | Used when no value is provided |
| Required | Whether the field must be filled |
| Options | Comma-separated choices (for `select` type) |

When you run a workflow that has inputs, a form appears to collect the values.

## Running a Workflow

### Manually

Click **Run** on a workflow card. If the workflow has input fields, you'll be prompted to fill them in first.

### On a Schedule

Add a trigger to run a workflow automatically. HomeCloud supports cron-based schedules with common presets:

- Every minute / 5 minutes / 15 minutes
- Every hour
- Every day at midnight or 9 AM
- Every Monday at 9 AM
- First of every month
- Custom cron expression

A workflow can have multiple triggers, and the same trigger can be shared across workflows.

### Via AI Agent

If you have the [MCP server](mcp-server) enabled and an AI agent configured, the agent can create and execute workflow scripts on your behalf.

## Writing Scripts

Workflow scripts are plain JavaScript running in a Node.js worker thread. The following globals are available:

### Context

```javascript
const ctx = global.ctx;

ctx.inputs   // Input values passed to this run
ctx.config   // Workflow configuration (name, id, etc.)
ctx.trigger  // Trigger info (if run by a schedule)
ctx.host     // Info about the device running the workflow
```

### Finishing

```javascript
global.exit(true, 'All done');       // Success
global.exit(false, 'Something failed'); // Error
```

Always call `exit()` to complete the workflow. If omitted, the script will run until its timeout.

### Device APIs

```javascript
const sc = await getServiceController(); // Local device
const sc = await getServiceController('abc123'); // Remote device by fingerprint
```

The service controller gives access to various services like:

- **Files** — `sc.files.fs.readDir()`, `sc.files.fs.readFile()`, etc.
- **System** — `sc.system.deviceInfo()`, storage info, and more.

### Secrets

Store and retrieve sensitive values (like API keys) that persist across runs:

```javascript
await setSecret('my-api-key', 'sk-...');
const key = await getSecret('my-api-key');
```

### Logging

Use `console.log`, `console.warn`, `console.error`, etc. Output is saved to a log file for each execution.

## Execution History

Each workflow keeps a history of its recent runs (up to 20). For each execution you can see:

- **Status** — `ok`, `error`, `timeout`, or `cancelled`
- **Result message**
- **Start and end time**
- **Logs** — Full console output

View execution history by clicking on a workflow card and opening its details.

## Scripts

**Scripts** are saved as regular js files where you choose (typically `~/Workflows/[name]/workflow.js`).
