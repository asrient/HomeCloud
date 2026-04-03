// Worker bootstrap script for workflow execution
// This file runs inside a Worker Thread and sets up the execution environment.

const { workerData, parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');

const { scriptPath, scriptContent, context, logFilePath } = workerData;

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
            const Module = require('module');
            const m = new Module('<adhoc>');
            m._compile(scriptContent, '<adhoc>');
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
