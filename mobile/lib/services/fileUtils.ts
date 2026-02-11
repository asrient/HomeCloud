import { MobilePlatform } from "../types";
import superman from "@/modules/superman";
import { Paths } from 'expo-file-system/next';
import mime from 'mime';
import * as MediaLibrary from 'expo-media-library';

// MIME types that need special handling
const HEIC_MIME_TYPES = ['image/heif', 'image/heic', 'image/heif-sequence', 'image/heic-sequence'];

/**
 * Get MIME type from filename with special handling for formats that
 * the standard mime library doesn't handle well (e.g., HEIC/HEIF)
 */
export function getMimeType(filename: string): string | null {
    const lowerFilename = filename.toLowerCase();

    // Special handling for HEIC/HEIF files
    if (lowerFilename.endsWith('.heic') || lowerFilename.endsWith('.heif')) {
        return 'image/heic';
    }

    // Fall back to standard mime detection
    return mime.getType(filename);
}

/**
 * Check if a file is a HEIC/HEIF image based on mime type or filename
 */
export function isHeicFile(mimeType: string, filePath: string): boolean {
    const lowerMime = mimeType.toLowerCase();
    const lowerPath = filePath.toLowerCase();
    return (
        HEIC_MIME_TYPES.includes(lowerMime) ||
        lowerPath.endsWith('.heic') ||
        lowerPath.endsWith('.heif')
    );
}

export type ResolvedFileInfo = {
    /** The actual file URI that can be used to read the file */
    fileUri: string;
    /** The original filename */
    filename: string;
    /** The MIME type of the file */
    mimeType: string | null;
};

/**
 * Resolve a file path/URI to get the actual file URI, filename, and MIME type.
 * Supports ph:// (iOS Photos), file://, and regular paths.
 */
export async function resolveFileUri(uri: string): Promise<ResolvedFileInfo> {
    // Handle iOS Photos library URLs
    if (uri.startsWith('ph://') && modules.config.PLATFORM === MobilePlatform.IOS) {
        const photoId = uri.slice(5);
        const asset = await MediaLibrary.getAssetInfoAsync(photoId);
        if (!asset) {
            throw new Error("Asset not found");
        }
        const fileUri = asset.localUri || asset.uri;
        const filename = asset.filename || Paths.basename(fileUri);
        const mimeType = getMimeType(filename);
        return { fileUri, filename, mimeType };
    }

    // Handle file:// URLs or regular paths
    const fileUri = pathToUri(uri);
    const filename = Paths.basename(fileUri);
    const mimeType = getMimeType(filename);
    return { fileUri, filename, mimeType };
}

export function getDrivesMapping(): Record<string, string> {
    const drives: Record<string, string> = {};
    if (modules.config.PLATFORM === MobilePlatform.IOS) {
        drives[modules.config.APP_NAME] = Paths.document.uri;
    } else {
        // Android
        drives['Phone Storage'] = superman.getStandardDirectoryUri('Phone Storage') || Paths.document.uri;

        const sdCardPath = superman.getStandardDirectoryUri('SD Card');
        if (sdCardPath) {
            drives['SD Card'] = sdCardPath;
        }
    }
    if (modules.config.IS_DEV) {
        // Add app's cache directory for easy access.
        drives['App Cache'] = Paths.cache.uri;
    }
    return drives;
}

function uriDecode(string: string) {
    return decodeURIComponent(string);
}

export function pathToUri(filePath: string) {
    filePath = uriDecode(filePath);
    // return as it is if it does not start with a slash
    if (!filePath.startsWith('/')) {
        return filePath; // Return as is if not an absolute path
    }
    filePath = filePath.slice(1); // Remove leading slash
    const drivesMapping = getDrivesMapping();
    const parts = filePath.split('/');
    if (parts.length > 0 && drivesMapping[parts[0]]) {
        parts[0] = drivesMapping[parts[0]];
    }
    return Paths.join(...parts);
}

export function uriToPath(filePath: string): string {
    const drivesMapping = getDrivesMapping();
    for (const [key, value] of Object.entries(drivesMapping)) {
        if (filePath.startsWith(value)) {
            let relativePath = uriDecode(filePath.slice(value.length));
            if (relativePath.startsWith('/')) {
                relativePath = relativePath.slice(1);
            }
            // console.log('original path:', filePath, 'mapped to:', `/${key}/${relativePath}`);
            return Paths.join('/', key, relativePath);
        }
    }
    return filePath; // If no mapping found, return as is
}
