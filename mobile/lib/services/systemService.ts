import { SystemService } from "shared/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, OSType, DeviceFormType, BatteryInfo, Disk, ClipboardContent, ClipboardContentType, ClipboardFile } from "shared/types";
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
import { shareAsync } from 'expo-sharing';
import mime from 'mime';

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

    public async copyToClipboard(content: string | ClipboardFile[], type: ClipboardContentType = 'text'): Promise<void> {
        const text = typeof content === 'string' ? content : '';
        if (type === 'link') {
            await Clipboard.setUrlAsync(text);
        } else {
            await Clipboard.setStringAsync(text, { inputFormat: type === 'html' ? Clipboard.StringFormat.HTML : Clipboard.StringFormat.PLAIN_TEXT });
        }
    }

    @exposed
    public async readClipboard(): Promise<ClipboardContent | null> {
        const hasUrl = await Clipboard.hasUrlAsync();
        if (hasUrl) {
            const url = await Clipboard.getUrlAsync();
            if (!url) {
                return null;
            }
            return { type: 'link', content: url };
        } else {
            const text = await Clipboard.getStringAsync();
            if (text) {
                return { type: 'text', content: text };
            }
        }
        return null;
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

    @exposed
    public async listDisks(): Promise<Disk[]> {
        const disks: Disk[] = [];
        const nativeDisks = await superman.getDisks();
        for (const ndisk of nativeDisks) {
            let name = ndisk.name;
            let path = ndisk.path;
            if (path === '/') {
                if (Platform.OS === 'ios') {
                    let deviceName = Device.deviceType === Device.DeviceType.PHONE ? 'iPhone' :
                        Device.deviceType === Device.DeviceType.TABLET ? 'iPad' : 'iOS';
                    name = `${deviceName} Storage`;
                    path = '/Media Center/';
                } else if (Platform.OS === 'android') {
                    name = 'Internal Storage';
                }
            }
            const disk: Disk = {
                type: ndisk.type,
                name: name,
                path,
                size: ndisk.size,
                free: ndisk.free,
            };
            disks.push(disk);
        }
        return disks;
    }

    public async share(options: { title?: string; description?: string; content?: string; files?: string[]; type: "url" | "text" | "file"; }): Promise<void> {
        if (options.type === 'file' && options.files && options.files.length > 1) {
            throw new Error("Sharing multiple files is not supported on mobile.");
        }
        let content = options.content || '';
        if (options.type === 'file' && options.files && options.files.length > 0) {
            content = pathToUri(options.files[0]);
            console.log('Sharing file:', content);
        }
        let mimeType = 'text/plain';
        let UTI = 'public.data';
        switch (options.type) {
            case 'url':
                mimeType = 'text/plain';
                UTI = 'public.url';
                break;
            case 'text':
                mimeType = 'text/plain';
                UTI = 'public.plain-text';
                break;
            case 'file':
                mimeType = mime.getType(content) || 'application/octet-stream';
                if (mimeType.startsWith('image/')) {
                    UTI = 'public.image';
                } else if (mimeType.startsWith('video/')) {
                    UTI = 'public.video';
                } else if (mimeType.startsWith('audio/')) {
                    UTI = 'public.audio';
                } else if (mimeType === 'application/pdf') {
                    UTI = 'com.adobe.pdf';
                }
                break;
        }

        await shareAsync(content, {
            dialogTitle: options.title || 'Share',
            mimeType,
            UTI,
        });
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
