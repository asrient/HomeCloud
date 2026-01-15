import { MobilePlatform } from "../types";
import superman from "@/modules/superman";
import { Paths } from 'expo-file-system/next';


export function getDrivesMapping(): Record<string, string> {
    if (modules.config.PLATFORM === MobilePlatform.IOS) {
        return {
            'Media Center': Paths.document.uri
        }
    }
    // Android
    const drives: Record<string, string> = {
        'Phone Storage': superman.getStandardDirectoryUri('Phone Storage') || Paths.document.uri,
    }
    const sdCardPath = superman.getStandardDirectoryUri('SD Card');
    if (sdCardPath) {
        drives['SD Card'] = sdCardPath;
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
