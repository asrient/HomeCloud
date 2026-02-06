import { PermissionsAndroid, Platform } from 'react-native'
import superman from '@/modules/superman';

/**
 * Check if the app has full storage access.
 * - Android 11+ (API 30): Requires MANAGE_EXTERNAL_STORAGE (checked via isExternalStorageManager)
 * - Android 10 and below: Requires READ_EXTERNAL_STORAGE + WRITE_EXTERNAL_STORAGE
 * - iOS: Always returns true (not applicable)
 */
export async function hasStorageAccess(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    // API 30+: MANAGE_EXTERNAL_STORAGE
    if (Platform.Version >= 30) {
        return superman.hasAllFilesAccess();
    }

    // API <30: Check legacy permissions
    const read = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
    const write = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
    return read && write;
}

/**
 * Request storage access.
 * - Android 11+: Opens system Settings for "All files access" toggle
 * - Android 10 and below: Shows standard runtime permission dialogs
 * - Returns true if permission was granted (for legacy) or intent was launched (for API 30+)
 */
export async function requestStorageAccess(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    // API 30+: Launch Settings intent for MANAGE_EXTERNAL_STORAGE
    if (Platform.Version >= 30) {
        if (superman.hasAllFilesAccess()) return true;
        return superman.requestAllFilesAccess();
    }

    // API <30: Request legacy permissions
    try {
        const results = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        ]);
        return (
            results[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED &&
            results[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED
        );
    } catch {
        return false;
    }
}
