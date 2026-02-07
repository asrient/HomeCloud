import { hasStorageAccess, requestStorageAccess } from '@/lib/permissions';
import { useAlert } from '@/hooks/useAlert';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { getAppName } from '@/lib/utils';

export function usePermissions() {
    const { showAlert } = useAlert();

    const requestPermissions = useCallback(async () => {
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

        const askStorageAccess = async () => {
            if (Platform.OS === 'android') {
                const granted = await hasStorageAccess();
                console.log('Storage access granted:', granted);
                if (!granted) {
                    const userConfirmed = await showStorageAccessConfirm();
                    console.log('User confirmed storage access intent:', userConfirmed);
                    if (userConfirmed) {
                        await requestStorageAccess();
                    }
                }
            }
        };

        try {
            await askStorageAccess();
        } catch (error) {
            console.error('Permission request failed:', error);
            return false;
        }
        return true;
    }, [showAlert]);

    return { requestPermissions };
}
