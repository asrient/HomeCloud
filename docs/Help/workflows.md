# Automation

Automation lets you run tasks on your HomeCloud devices using JavaScript. Create scripts that read files, control devices, and run on a schedule or anytime manually.

## Creating an Automation

1. Go to the **Automation** page.
2. Click **New Automation**.
3. Enter a name and choose where to save the script.
4. HomeCloud creates a starter script you can edit right away.

Each automation is a JavaScript file that runs in an isolated environment with access to all HomeCloud's device APIs.

## Editing an Automation

You can configure:

- **Enabled/disabled** — Disable an automation without deleting it; its triggers will be paused.
- **Max execution time** — After this the script run will be stopped and status will be set as timeout.
- **Input fields** — Define parameters that are prompted when running the automation; provided values can be accessed in the script.
- **Triggers** — Set up automatic schedules to run the script.

## Input Fields

Automations can define input fields so you or an external MCP client can pass values at run time. Each field has:

| Property | Description |
|----------|-------------|
| Name | Field identifier |
| Type | `string`, `number`, `boolean`, or `select` |
| Default value | Used when no value is provided |
| Required | Whether the field must be filled |
| Options | Comma-separated choices (for `select` type) |

When you run an automation that has inputs, a form appears to collect the values.

## Running an Automation

### Manually

Click **Run** on an automation card. If the automation has input fields, you'll be prompted to fill them in first.

### On a Schedule

Add a trigger to run an automation automatically. HomeCloud supports cron-based schedules with common presets:

- Every minute / 5 minutes / 15 minutes
- Every hour
- Every day at midnight or 9 AM
- Every Monday at 9 AM
- First of every month
- Custom cron expression

An automation can have multiple triggers, and the same trigger can be shared across automations.

### Via MCP

If you have the [MCP server](mcp-server) enabled, a compatible external client can create and execute automation scripts through the tools HomeCloud exposes.

## Writing Scripts

Automation scripts are plain JavaScript running in a Node.js worker thread. The following globals are available:

### Context

```javascript
const ctx = global.ctx;

ctx.inputs   // Input values passed to this run
ctx.config   // Automation configuration (name, id, etc.)
ctx.trigger  // Trigger info (if run by a schedule)
ctx.host     // Info about the device running the automation
```

### Finishing

```javascript
global.exit(true, 'All done');       // Success
global.exit(false, 'Something failed'); // Error
```

Always call `exit()` to complete the automation. If omitted, the script will run until its timeout.

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

Each automation keeps a history of its recent runs (up to 20). For each execution you can see:

- **Status** — `ok`, `error`, `timeout`, or `cancelled`
- **Result message**
- **Start and end time**
- **Logs** — Full console output

View execution history by clicking on an automation card and opening its details.

## Scripts

**Scripts** are saved as regular JavaScript files wherever you choose. Existing default paths and filenames remain `~/Workflows/[name]/workflow.js`.
