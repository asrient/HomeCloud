import { File, Paths } from 'expo-file-system/next';
import { AppState } from 'react-native';

const LOG_FILE_NAME = 'app.log';
const BUFFER_FLUSH_THRESHOLD = 50;

let logLines: string[] = [];
let logFile: File | null = null;

/**
 * Set up file logging. Clears the previous log file and patches console
 * methods to also append to the log file in the data directory.
 * Flushes to disk when the app goes to background or the buffer is large.
 *
 * Call this early in app startup, before initModules.
 */
export function setupFileLogger(dataDir: string) {
    const logPath = Paths.join(dataDir, LOG_FILE_NAME);
    logFile = new File(logPath);

    // Clear previous log on app restart
    try {
        if (logFile.exists) {
            logFile.delete();
        }
    } catch { }
    logFile.write(`[${new Date().toISOString()}] === App started ===\n`);

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
}

async function flushToFile() {
    if (!logFile || logLines.length === 0) return;
    const lines = logLines.splice(0);
    const chunk = lines.join('');
    try {
        let existing = '';
        if (logFile.exists) {
            existing = await logFile.text();
        }
        logFile.write(existing + chunk);
    } catch {
        // Ignore errors
    }
}

/**
 * Get the path to the current log file.
 */
export function getLogFilePath(dataDir: string): string {
    return Paths.join(dataDir, LOG_FILE_NAME);
}
