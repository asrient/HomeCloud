import { File, Paths, Directory } from 'expo-file-system/next';
import { AppState, Platform } from 'react-native';

const LOG_DIR_NAME = 'AppLogs';
const LOG_FILE_NAME = 'app.log';
const OLD_LOG_FILE_NAME = 'app.old.log';
const MAX_LOG_SIZE = 3 * 1024 * 1024; // 3 MB
const BUFFER_FLUSH_THRESHOLD = 50;

let logLines: string[] = [];
let logFile: File | null = null;
let logDir: string = '';
let isDebugMode = Platform.isTesting || __DEV__;

/**
 * Set up file logging. Patches console methods to also append to a
 * log file in the data directory. Uses size-based rotation (5 MB),
 * keeping one backup file (app.old.log).
 *
 * Call this early in app startup, before initModules.
 */
export function setupFileLogger() {
    logDir = Paths.join(Paths.cache.uri, LOG_DIR_NAME);
    const dir = new Directory(logDir);
    if (!dir.exists) {
        dir.create();
    }
    const logPath = Paths.join(logDir, LOG_FILE_NAME);
    logFile = new File(logPath);

    // Clean up any leftover export file from a previous session
    deleteLogExportFile();

    // Rotate if existing log exceeds max size
    rotateIfNeeded();

    // Append session marker
    appendToFile(`[${new Date().toISOString()}] === App started ===\n`);

    // Flush when the app enters background
    AppState.addEventListener('change', (state) => {
        if (state === 'background') {
            flushToFile();
        }
    });

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    const writeToFile = (level: string, args: any[]) => {
        try {
            const timestamp = new Date().toISOString();
            const message = args
                .map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 0)))
                .join(' ');
            logLines.push(`[${timestamp}] [${level}] ${message}\n`);
            if (logLines.length >= BUFFER_FLUSH_THRESHOLD) {
                flushToFile();
            }
        } catch {
            // Silently ignore write errors to avoid infinite loops
        }
    };

    console.log = (...args: any[]) => {
        originalLog(...args);
        writeToFile('LOG', args);
    };

    console.warn = (...args: any[]) => {
        originalWarn(...args);
        writeToFile('WARN', args);
    };

    console.error = (...args: any[]) => {
        originalError(...args);
        writeToFile('ERROR', args);
    };

    console.info = (...args: any[]) => {
        originalInfo(...args);
        writeToFile('INFO', args);
    };

    console.debug = (...args: any[]) => {
        originalDebug(...args);
        // Only write debug to file in dev mode
        if (isDebugMode) {
            writeToFile('DEBUG', args);
        }
    };

    // Catch unhandled JS errors
    const defaultHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error, isFatal) => {
        writeToFile('FATAL', [error?.message || String(error)]);
        flushToFileSync();
        if (defaultHandler) {
            defaultHandler(error, isFatal);
        }
    });
}

async function rotateIfNeeded() {
    if (!logFile || !logFile.exists) return;
    try {
        if (logFile.size > MAX_LOG_SIZE) {
            const oldPath = Paths.join(logDir, OLD_LOG_FILE_NAME);
            const oldFile = new File(oldPath);
            if (oldFile.exists) {
                oldFile.delete();
            }
            // Copy content to old file and clear current
            const content = await logFile.text();
            oldFile.write(content);
            logFile.write('');
        }
    } catch {
        // If rotation fails, just continue with the current file
    }
}

async function appendToFile(text: string) {
    if (!logFile) return;
    try {
        let existing = '';
        if (logFile.exists) {
            existing = await logFile.text();
        }
        logFile.write(existing + text);
    } catch { }
}

async function flushToFile() {
    if (!logFile || logLines.length === 0) return;
    const lines = logLines.splice(0);
    const chunk = lines.join('');
    await appendToFile(chunk);
    await rotateIfNeeded();
}

function flushToFileSync() {
    if (!logFile || logLines.length === 0) return;
    const lines = logLines.splice(0);
    const chunk = lines.join('');
    // Best-effort write — can't await in crash handler
    try {
        if (logFile.exists) {
            logFile.write(chunk);
        }
    } catch { }
}

/**
 * Get the path to the current log file.
 */
export function getLogFilePath(): string {
    return Paths.join(Paths.cache.uri, LOG_DIR_NAME, LOG_FILE_NAME);
}

const EXPORT_FILE_NAME = 'homecloud-mobile.log';

/**
 * Flush buffered logs, concat old + current into a single export file.
 * Returns the path to the export file.
 */
export async function buildLogExportFile(): Promise<string> {
    await flushToFile();

    const logPath = Paths.join(Paths.cache.uri, LOG_DIR_NAME, LOG_FILE_NAME);
    const oldLogPath = Paths.join(Paths.cache.uri, LOG_DIR_NAME, OLD_LOG_FILE_NAME);
    const logFile = new File(logPath);
    const oldLogFile = new File(oldLogPath);

    if (!logFile.exists && !oldLogFile.exists) {
        throw new Error('No log file found.');
    }

    let content = '';
    if (oldLogFile.exists) {
        content += await oldLogFile.text();
    }
    if (logFile.exists) {
        content += await logFile.text();
    }

    const exportPath = Paths.join(Paths.cache.uri, EXPORT_FILE_NAME);
    const exportFile = new File(exportPath);
    exportFile.write(content);
    return exportPath;
}

/**
 * Delete the temporary export file created by buildLogExportFile.
 */
export function deleteLogExportFile(): void {
    const exportPath = Paths.join(Paths.cache.uri, EXPORT_FILE_NAME);
    const exportFile = new File(exportPath);
    try {
        if (exportFile.exists) exportFile.delete();
    } catch { }
}
