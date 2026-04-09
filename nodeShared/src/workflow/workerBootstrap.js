// Worker bootstrap script for workflow execution
// This file runs inside a Worker Thread and sets up the execution environment.

const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const Comlink = require('comlink');
const nodeEndpoint = require('comlink/dist/umd/node-adapter');

const { scriptPath, scriptContent, context, logFilePath, hostPort } = workerData;

// --- Host RPC via Comlink ---
global.com = Comlink.wrap(nodeEndpoint(hostPort));

// --- Input stream helper ---
// Recursively scan args: replace ReadableStream instances with { __stream: id }
// markers and start pushing chunks to host via postStreamChunk/endStream.
let streamIdCounter = 0;
function prepareArgs(args) {
    return args.map(arg => prepareValue(arg));
}
function prepareValue(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof ReadableStream) {
        const id = 'ws_' + (++streamIdCounter);
        // Start pushing asynchronously — don't await, let it run in background
        (async () => {
            const reader = value.getReader();
            try {
                while (true) {
                    const { done, value: chunk } = await reader.read();
                    if (done) { await global.com.endStream(id); break; }
                    await global.com.postStreamChunk(id, chunk);
                }
            } catch (err) {
                await global.com.endStream(id, err.message || String(err));
            }
        })();
        return { __stream: id };
    }
    if (Array.isArray(value)) return value.map(prepareValue);
    if (typeof value === 'object' && value.constructor === Object) {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = prepareValue(v);
        }
        return result;
    }
    return value;
}

// --- Output stream resolver ---
// Recursively scan return values: convert { __stream: id } markers from host
// into real ReadableStreams that pull chunks via host.readStreamChunk().
function resolveOutputStreams(value) {
    if (value === null || value === undefined) return value;
    if (typeof value === 'object' && value.__stream) {
        const id = value.__stream;
        return new ReadableStream({
            async pull(controller) {
                const { done, value: chunk } = await global.com.readStreamChunk(id);
                if (done) controller.close();
                else controller.enqueue(chunk);
            }
        });
    }
    if (Array.isArray(value)) return value.map(resolveOutputStreams);
    if (typeof value === 'object' && value.constructor === Object) {
        const result = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = resolveOutputStreams(v);
        }
        return result;
    }
    return value;
}

// --- Service Controller Proxy ---
// Usage: const sc = getServiceController(); await sc.files.fs.readDir("/path");
// Remote: const remote = getServiceController("fingerprint"); await remote.system.deviceInfo();
function createServiceProxy(fingerprint, segments) {
    return new Proxy(function () { }, {
        get(_target, prop) {
            if (typeof prop !== 'string' || prop === 'then') return undefined;
            return createServiceProxy(fingerprint, [...segments, prop]);
        },
        apply(_target, _thisArg, args) {
            return global.com.callApi(fingerprint, segments.join('.'), prepareArgs(args))
                .then(resolveOutputStreams);
        }
    });
}
global.getServiceController = (fingerprint) => createServiceProxy(fingerprint || null, []);
global.getSecret = (key) => global.com.getSecret(key);
global.setSecret = (key, value) => global.com.setSecret(key, value);

// Setup log file writing
let logStream = null;
if (logFilePath) {
    const logDir = path.dirname(logFilePath);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
}

function writeLog(level, args) {
    const timestamp = new Date().toISOString();
    const message = args.map(a => {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch { return String(a); }
    }).join(' ');
    const line = `[${timestamp}] [${level}] ${message}\n`;
    if (logStream) {
        logStream.write(line);
    }
}

// Override console methods to capture logs
const originalConsole = { ...console };
console.log = (...args) => { originalConsole.log(...args); writeLog('LOG', args); };
console.warn = (...args) => { originalConsole.warn(...args); writeLog('WARN', args); };
console.error = (...args) => { originalConsole.error(...args); writeLog('ERROR', args); };
console.info = (...args) => { originalConsole.info(...args); writeLog('INFO', args); };
console.debug = (...args) => { originalConsole.debug(...args); writeLog('DEBUG', args); };

// Set up global context
global.ctx = context;

// Set up global.exit
let hasExited = false;
global.exit = (success, message) => {
    if (hasExited) return;
    hasExited = true;
    const status = success === false ? 'error' : 'ok';
    const result = { status, message };
    if (logStream) {
        writeLog('LOG', [`Workflow exited: ${status}${message ? ' - ' + message : ''}`]);
        logStream.end();
    }
    parentPort.postMessage({ type: 'result', result });
    process.exit(0);
};

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    if (hasExited) return;
    hasExited = true;
    const result = { status: 'error', message: err.message || String(err) };
    writeLog('ERROR', ['Uncaught exception:', err.stack || err.message || String(err)]);
    if (logStream) logStream.end();
    parentPort.postMessage({ type: 'result', result });
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    if (hasExited) return;
    hasExited = true;
    const msg = reason instanceof Error ? reason.message : String(reason);
    const result = { status: 'error', message: msg };
    writeLog('ERROR', ['Unhandled rejection:', reason instanceof Error ? reason.stack : msg]);
    if (logStream) logStream.end();
    parentPort.postMessage({ type: 'result', result });
    process.exit(1);
});

// Execute the script
(async () => {
    try {
        if (scriptPath) {
            require(scriptPath);
        } else if (scriptContent) {
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            await new AsyncFunction(scriptContent)();
        }
    } catch (err) {
        if (!hasExited) {
            hasExited = true;
            const result = { status: 'error', message: err.message || String(err) };
            writeLog('ERROR', ['Script error:', err.stack || err.message || String(err)]);
            if (logStream) logStream.end();
            parentPort.postMessage({ type: 'result', result });
            process.exit(1);
        }
    }
})();
