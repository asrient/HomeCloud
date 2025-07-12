import { PermissionsAndroid, Permission } from 'react-native'

type AndroidPermissionConfig = {
    title: string;
    message: string;
    permission: Permission;
    required?: boolean; // If true, permission is mandatory
}

export const AndroidPermissionGroups: Record<string, AndroidPermissionConfig[]> = {
    MANAGE_STORAGE: [{
        title: 'Read External Storage',
        message: 'This app needs access to read files from your device storage.',
        permission: PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        required: true
    }, {
        title: 'Write External Storage',
        message: 'This app needs access to write files to your device storage.',
        permission: PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        required: true
    }],
};


export async function requestPermission(config: AndroidPermissionConfig): Promise<boolean> {
    // Check if the permission is already granted
    const alreadyGranted = await PermissionsAndroid.check(config.permission);
    if (alreadyGranted) {
        return true;
    }
    // If not granted, request the permission
    try {
        const granted = await PermissionsAndroid.request(
            config.permission,
            {
                title: config.title,
                message: config.message,
                buttonPositive: 'Okay',
            }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    catch (_: any) {
        //Handle this error
        return false;
    }
}

export async function checkGroupPermission(group: string): Promise<boolean> {
    const permissions = AndroidPermissionGroups[group];
    if (!permissions) {
        throw new Error(`Unknown permission group: ${group}`);
    }

    for (const config of permissions) {
        const isGranted = await PermissionsAndroid.check(config.permission);
        // If the permission is not granted and it's required, return false
        if (!isGranted && config.required) {
            return false;
        }
    }
    return true;
}

export async function requestGroupPermission(group: string): Promise<boolean> {
    const permissions = AndroidPermissionGroups[group];
    if (!permissions) {
        throw new Error(`Unknown permission group: ${group}`);
    }

    for (const config of permissions) {
        const granted = await requestPermission(config);
        if (!granted && config.required) {
            return false; // If any required permission is denied, return false
        }
    }
    return true; // All permissions granted
}
