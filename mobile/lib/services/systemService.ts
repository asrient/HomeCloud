import { SystemService } from "shared/services/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, OSType, DeviceFormType } from "shared/types";
import { serviceStartMethod, serviceStopMethod } from "shared/services/primatives";
import { Alert, Platform, Linking } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';

/**
 * Mobile implementation of SystemService using React Native APIs for system interactions.
 */
class MobileSystemService extends SystemService {

    /**
     * Gets device information using cached values.
     * @returns {Promise<DeviceInfo>} Device information including OS, OS flavor, and form factor.
     */
    public async getDeviceInfo(): Promise<DeviceInfo> {
        const osType = this.getOSType();
        const osFlavour = await this.getOSFlavour();
        const formFactor = this.getFormFactor();

        return {
            os: osType,
            osFlavour,
            formFactor
        };
    }

    private getOSType(): OSType {
        if (Platform.OS === 'ios') {
            return OSType.iOS;
        } else if (Platform.OS === 'android') {
            return OSType.Android;
        }
        return OSType.Unknown;
    }

    private async getOSFlavour(): Promise<string | null> {
        try {
            if (Platform.OS === 'ios') {
                return Platform.Version as string;
            } else if (Platform.OS === 'android') {
                return Platform.Version.toString();
            }
        } catch (error) {
            console.warn('Failed to get OS flavour:', error);
        }
        return null;
    }

    private getFormFactor(): DeviceFormType {
        switch (Device.deviceType) {
            case Device.DeviceType.PHONE:
                return DeviceFormType.Mobile;
            case Device.DeviceType.TABLET:
                return DeviceFormType.Tablet;
            case Device.DeviceType.DESKTOP:
                return DeviceFormType.Desktop;
            case Device.DeviceType.TV:
                return DeviceFormType.Unknown;
            default:
                return DeviceFormType.Unknown;
        }
    }

    /**
     * Gets default system directories using cached values.
     * @returns {Promise<DefaultDirectories>} Default directories like Documents, Downloads, etc.
     */
    public async getDefaultDirectories(): Promise<DefaultDirectories> {
        return {
            Pictures: FileSystem.documentDirectory,
            Documents: FileSystem.documentDirectory,
            Downloads: FileSystem.documentDirectory,
            Videos: FileSystem.documentDirectory,
            Movies: FileSystem.documentDirectory,
            Music: FileSystem.documentDirectory,
            Desktop: null, // Not available on mobile
        };
    }

    /**
     * Shows an alert dialog.
     * @param {string} title - The title of the alert.
     * @param {string} [description] - Optional description/message for the alert.
     */
    public alert(title: string, description?: string): void {
        Alert.alert(title, description, [{ text: 'OK' }]);
    }

    /**
     * Shows a custom dialog with configurable buttons.
     * @param {NativeAskConfig} config - Configuration for the dialog including title, description, and buttons.
     * @returns {NativeAsk} Object with a close method to programmatically close the dialog.
     */
    public ask(config: NativeAskConfig): NativeAsk {
        const buttons = config.buttons.map(button => ({
            text: button.text,
            style: button.type === 'danger' ? 'destructive' as const :
                button.type === 'primary' ? 'default' as const : 'cancel' as const,
            onPress: button.onPress
        }));

        Alert.alert(config.title, config.description, buttons);

        return {
            close: () => {
                // React Native Alert doesn't provide a way to programmatically close
                console.warn('Alert close requested, but React Native Alert cannot be closed programmatically');
            }
        };
    }

    public async openUrl(url: string): Promise<void> {
        await Linking.openURL(url);
    }

    public async openFile(filePath: string): Promise<void> {
        try {
            // For mobile, we try to open the file URL using Linking
            // This will open the file with the default app that can handle it
            await Linking.openURL(filePath);
        } catch (error) {
            console.warn('Failed to open file:', error);
            // Fallback: show alert that file cannot be opened
            Alert.alert('Cannot Open File', 'No application found to open this file type.');
        }
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}

export default MobileSystemService;
