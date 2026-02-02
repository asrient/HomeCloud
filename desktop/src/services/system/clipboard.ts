import { clipboard } from "electron";
import plist from "plist";
import * as win32Clipboard from "./drivers/win32";
import { ClipboardFile } from "shared/types";

const CUSTOM_CLIPBOARD_TYPE = 'application/x-homecloud-files';

/**
 * Writes file paths to the clipboard using native Windows API.
 */
function writeFilePathsWindows(filePaths: string[]): void {
    // Normalize paths to use backslashes
    const normalizedPaths = filePaths.map(fp => fp.replace(/\//g, '\\'));

    const success = win32Clipboard.setClipboardFilePaths(normalizedPaths);
    if (!success) {
        console.error('Failed to write file paths to clipboard via native API');
    }
}

/**
 * Writes file paths to the clipboard in a platform-specific way.
 * The paths can then be pasted in native file explorers.
 */
function writeFilePathsToClipboardNative(filePaths: string[]): void {
    if (filePaths.length === 0) return;

    if (process.platform === 'darwin') {
        // macOS: Use NSFilenamesPboardType with plist format
        const plistData = plist.build(filePaths);
        clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plistData));
    } else if (process.platform === 'win32') {
        // Windows: Use native API with CF_HDROP format
        writeFilePathsWindows(filePaths);
    } else if (process.platform === 'linux') {
        // Linux: Use text/uri-list format with file:// URIs
        const uriList = filePaths.map(fp => `file://${encodeURI(fp)}`).join('\r\n');
        clipboard.writeBuffer('text/uri-list', Buffer.from(uriList, 'utf-8'));

        // Also write x-special/gnome-copied-files for GNOME/GTK apps
        const gnomeFormat = 'copy\n' + filePaths.map(fp => `file://${encodeURI(fp)}`).join('\n');
        clipboard.writeBuffer('x-special/gnome-copied-files', Buffer.from(gnomeFormat, 'utf-8'));
    }
}

function writeCustomClipboardContent(clipboardFiles: ClipboardFile[]) {
    const data = JSON.stringify(clipboardFiles);
    const buff = Buffer.from(data, 'utf-8');
    clipboard.writeBuffer(CUSTOM_CLIPBOARD_TYPE, buff);
}

export function writeFilePathsToClipboard(clipboardFile: ClipboardFile[]): void {
    const canUseNative = clipboardFile.every(cf => !cf.fingerprint && !cf.cut);
    if (canUseNative) {
        const paths = clipboardFile.map(cf => cf.path);
        writeFilePathsToClipboardNative(paths);
    } else {
        writeCustomClipboardContent(clipboardFile);
    }
}

/**
 * Reads file paths from the clipboard in a platform-specific way.
 * @returns Array of file paths or null if no file paths are in clipboard.
 */
function readFilePathsFromClipboardNative(): string[] | null {
    if (process.platform === 'darwin') {
        return readFilePathsMacOS();
    } else if (process.platform === 'win32') {
        return readFilePathsWindows();
    } else if (process.platform === 'linux') {
        return readFilePathsLinux();
    }
    return null;
}

function hasCustomClipboardContent(): boolean {
    return clipboard.availableFormats().includes(CUSTOM_CLIPBOARD_TYPE);
}

function parseCustomClipboardContent(): ClipboardFile[] | null {
    if (!hasCustomClipboardContent()) {
        return null;
    }
    const rawData = clipboard.readBuffer(CUSTOM_CLIPBOARD_TYPE);
    try {
        const parsed = JSON.parse(rawData.toString('utf-8'));
        if (Array.isArray(parsed)) {
            return parsed as ClipboardFile[];
        }
    } catch (e) {
        console.error('Failed to parse custom clipboard content:', e);
    }
    return null;
}

export function readFilePathsFromClipboard(): ClipboardFile[] | null {
    if (hasCustomClipboardContent()) {
        return parseCustomClipboardContent();
    }
    const nativePaths = readFilePathsFromClipboardNative();
    if (nativePaths) {
        return nativePaths.map(path => ({ path }));
    }
    return null;
}

/**
 * macOS: Read file paths from clipboard
 */
function readFilePathsMacOS(): string[] | null {
    // Try NSFilenamesPboardType first (multiple files in plist format)
    if (clipboard.has('NSFilenamesPboardType')) {
        try {
            const plistData = clipboard.read('NSFilenamesPboardType');
            if (plistData) {
                const parsed = plist.parse(plistData);
                if (Array.isArray(parsed)) {
                    return parsed as string[];
                }
            }
        } catch (e) {
            console.error('Failed to parse NSFilenamesPboardType:', e);
        }
    }

    // Fallback: Try public.file-url for single file
    if (clipboard.has('public.file-url')) {
        const fileUrl = clipboard.read('public.file-url');
        if (fileUrl) {
            const filePath = decodeURI(fileUrl.replace('file://', ''));
            return [filePath];
        }
    }

    return null;
}

/**
 * Windows: Read file paths from clipboard using native API
 */
function readFilePathsWindows(): string[] | null {
    const paths = win32Clipboard.getClipboardFilePaths();
    if (paths && paths.length > 0) {
        return paths;
    }

    // Fallback: Try FileNameW via Electron (single file only)
    if (clipboard.has('FileNameW')) {
        const rawFilePath = clipboard.read('FileNameW');
        if (rawFilePath) {
            // Remove all null characters (Windows uses null-terminated strings)
            const filePath = rawFilePath.replace(/\0/g, '').trim();
            if (filePath.length > 0) {
                return [filePath];
            }
        }
    }

    return null;
}

/**
 * Linux: Read file paths from clipboard
 */
function readFilePathsLinux(): string[] | null {
    // Try x-special/gnome-copied-files first (GNOME/GTK format)
    if (clipboard.has('x-special/gnome-copied-files')) {
        const data = clipboard.read('x-special/gnome-copied-files');
        if (data) {
            const lines = data.split('\n');
            // First line is 'copy' or 'cut', rest are file URIs
            if (lines.length > 1) {
                const paths = lines.slice(1)
                    .map(line => line.trim())
                    .filter(line => line.startsWith('file://'))
                    .map(uri => decodeURI(uri.replace('file://', '')));
                if (paths.length > 0) {
                    return paths;
                }
            }
        }
    }

    // Fallback: Try text/uri-list
    if (clipboard.has('text/uri-list')) {
        const uriList = clipboard.read('text/uri-list');
        if (uriList) {
            const paths = uriList.split(/[\r\n]+/)
                .map(line => line.trim())
                .filter(line => line.startsWith('file://'))
                .map(uri => decodeURI(uri.replace('file://', '')));
            if (paths.length > 0) {
                return paths;
            }
        }
    }

    return null;
}

/**
 * Checks if the clipboard contains file paths.
 */
export function hasFilePathsInClipboard(): boolean {
    if (hasCustomClipboardContent()) {
        return true;
    }
    if (process.platform === 'darwin') {
        return clipboard.has('NSFilenamesPboardType') || clipboard.has('public.file-url');
    } else if (process.platform === 'win32') {
        return win32Clipboard.hasClipboardFilePaths() || clipboard.has('FileNameW');
    } else if (process.platform === 'linux') {
        return clipboard.has('x-special/gnome-copied-files') || clipboard.has('text/uri-list');
    }
    return false;
}
