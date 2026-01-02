import { SystemService } from "shared/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, OSType, DeviceFormType, BatteryInfo } from "shared/types";
import { exposed, serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import { Alert, Platform, Linking } from 'react-native';
import * as Device from 'expo-device';
import { Paths } from 'expo-file-system/next';
import { MobilePlatform } from "../types";
import superman from "@/modules/superman";
import { pathToUri } from "./fileUtils";
import { preview } from "expo-quicklook-preview";
import * as Clipboard from 'expo-clipboard';
import { VolumeManager } from 'react-native-volume-manager';
import { getPowerStateAsync, BatteryState, addBatteryLevelListener, addBatteryStateListener, addLowPowerModeListener } from 'expo-battery';
// import { startActivityAsync, ActivityAction } from 'expo-intent-launcher';

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

    private async getDefaultDirsAndroid(): Promise<DefaultDirectories> {
        const defaultDirs: DefaultDirectories = {
            Pictures: superman.getStandardDirectoryUri('Pictures'),
            Documents: superman.getStandardDirectoryUri('Documents'),
            Downloads: superman.getStandardDirectoryUri('Downloads'),
            Videos: superman.getStandardDirectoryUri('Videos'),
            Movies: superman.getStandardDirectoryUri('Movies'),
            Music: superman.getStandardDirectoryUri('Music'),
            Desktop: null // Not available on mobile
        };
        return defaultDirs;
    }

    private async getDefaultDirsIos(): Promise<DefaultDirectories> {
        const dataDir = Paths.document;
        const defaultDirs: DefaultDirectories = {
            Pictures: null,
            Documents: Paths.join(dataDir, 'Documents'),
            Downloads: Paths.join(dataDir, 'Downloads'),
            Videos: null,
            Movies: null,
            Music: null,
            Desktop: null // Not available on mobile
        };
        return defaultDirs;
    }

    /**
     * Gets default system directories using cached values.
     * @returns {Promise<DefaultDirectories>} Default directories like Documents, Downloads, etc.
     */
    public async getDefaultDirectories(): Promise<DefaultDirectories> {
        if (modules.config.PLATFORM === MobilePlatform.ANDROID) {
            return this.getDefaultDirsAndroid();
        } else if (modules.config.PLATFORM === MobilePlatform.IOS) {
            return this.getDefaultDirsIos();
        }
        throw new Error("Unsupported platform for default directories.");
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
        filePath = pathToUri(filePath);
        console.log('Opening file:', filePath);
        try {
            // for ios we can use quicklook preview
            if (Platform.OS === 'ios') {
                await preview({ url: filePath });
            }
            // for android we use intent launcher
            else if (Platform.OS === 'android') {
                await Linking.openURL(filePath);
            } else {
                throw new Error('Unsupported platform for opening files.');
            }
        } catch (error) {
            console.warn('Failed to open file:', error);
            // Fallback: show alert that file cannot be opened
            Alert.alert('Cannot Open File', 'No application found to open this file type.');
        }
    }

    public async copyToClipboard(text: string, type?: 'text' | 'link'): Promise<void> {
        if (type === 'link') {
            await Clipboard.setUrlAsync(text);
        } else {
            await Clipboard.setStringAsync(text);
        }
    }

    @exposed
    public override async canControlVolumeLevel(): Promise<boolean> {
        return true;
    }

    @exposed
    public async getVolumeLevel(): Promise<number> {
        const volumeResult = await VolumeManager.getVolume();
        return volumeResult.volume;
    }

    @exposed
    public async setVolumeLevel(level: number): Promise<void> {
        await VolumeManager.setVolume(level);
    }

    // Battery info
    @exposed
    public async getBatteryInfo(): Promise<BatteryInfo> {
        const powerState = await getPowerStateAsync();
        return {
            level: powerState.batteryLevel === -1 ? 1 : powerState.batteryLevel,
            isCharging: powerState.batteryState === BatteryState.CHARGING || powerState.batteryState === BatteryState.FULL,
            isLowPowerMode: powerState.lowPowerMode,
        };
    }

    @exposed
    public async canGetBatteryInfo(): Promise<boolean> {
        return true;
    }

    @serviceStartMethod
    public async start() {
        // Set up battery listeners
        addBatteryLevelListener(async ({ batteryLevel }) => {
            const info = await this.getBatteryInfo();
            this.batteryInfoSignal.dispatch(info);
        });
        addBatteryStateListener(async ({ batteryState }) => {
            const info = await this.getBatteryInfo();
            this.batteryInfoSignal.dispatch(info);
        });
        addLowPowerModeListener(async ({ lowPowerMode }) => {
            const info = await this.getBatteryInfo();
            this.batteryInfoSignal.dispatch(info);
        });
    }

    @serviceStopMethod
    public async stop() {
    }
}

export default MobileSystemService;
