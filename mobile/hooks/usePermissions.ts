import { hasStorageAccess } from '@/lib/permissions';
import { useAlert } from '@/hooks/useAlert';
import { Platform } from 'react-native';
import { getAppName } from '@/lib/utils';

export function usePermissions() {
    const { showAlert } = useAlert();

    const showStorageAccessConfirm = () => {
        return new Promise<boolean>((resolve) => {
            showAlert(
                'Enable Storage Access',
                `All files access is required to browse and access your files from ${getAppName()}.`,
                [
                    { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                    { text: 'Continue', onPress: () => resolve(true) },
                ]
            );
        });
    };

    const requestStorageAccess = async () => {
        if (Platform.OS === 'android') {
            const granted = await hasStorageAccess();
            if (!granted) {
                const userConfirmed = await showStorageAccessConfirm();
                if (userConfirmed) {
                    await requestStorageAccess();
                }
            }
        }
    }

    const requestPermissions = async () => {
        try {
            await requestStorageAccess();
        } catch (error) {
            console.error('Permission request failed:', error);
            showAlert('Permissions Missing', error instanceof Error ? error.message : 'Some necessary permissions were not granted.');
            return false;
        }
        return true;
    };
    return { requestPermissions };
}
