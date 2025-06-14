import { envConfig } from "./core/index";
import fs from "fs";

function handleLog(type: 'info' | 'error' | 'warn', data: any[]) {
    if (!logStream) return;
    const logData = data.map((d) => {
        if (d instanceof Error) {
            return `${d.name}: ${d.message}\n${d.stack}\n`;
        }
        if (typeof d === 'object') {
            return JSON.stringify(d, null, 2);
        }
        return d;
    }).join(' ');
    logStream.write(`${type}: ${logData}\n`);
}

let logStream: fs.WriteStream | null = null;

export function setupLogger(logFile: string) {
    console.log = log;
    console.error = error;
    console.warn = warn;
    console.info = info;
    console.debug = debug;

    // Delete the log file if it exists
    if (fs.existsSync(logFile)) {
        try {
            fs.unlinkSync(logFile);
        } catch (e) {
            // ignored, will be written to the existing file.
        }
    }
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.write(`\n---------- New Instance Date: ${new Date().toISOString()} ---------------\n`);
}

export async function stopLogger() {
    return new Promise<void>((resolve, _reject) => {
        if (logStream) {
            logStream.end(() => {
                logStream = null;
                resolve();
            });
        }
        resolve();
    });
}

export function log(...data: any[]) {
    handleLog('info', data);
}

export function error(...data: any[]) {
    handleLog('error', data);
}

export function warn(...data: any[]) {
    handleLog('warn', data);
}

export function info(...data: any[]) {
    handleLog('info', data);
}

export function debug(...data: any[]) {
    if (envConfig.IS_DEV) {
        handleLog('info', data);
    }
}
