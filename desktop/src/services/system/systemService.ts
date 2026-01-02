import { SystemService } from "shared/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, AudioPlaybackInfo, BatteryInfo } from "shared/types";
import { getDefaultDirectoriesCached, getDeviceInfoCached } from "./deviceInfo";
import { dialog, BrowserWindow, shell, systemPreferences, clipboard } from "electron";
import { getDriveDetails } from "./drivers/win32";
import { WinDriveDetails } from "../../types";
import { exposed, serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import volumeDriver from "./volumeControl";
import * as mediaControlWin from "./mediaControl/win32";
import { getBatteryInfo, onBatteryInfoChanged } from "./batteryLevel";

const POLL_INTERVAL = 5000; // Polling interval for accent color changes

function winPlaybackInfoToAudioPlaybackInfo(info: mediaControlWin.AudioPlaybackInfoWin): AudioPlaybackInfo {
    const playbackInfo: AudioPlaybackInfo = {
        trackName: info.title || '',
        artistName: info.artist || '',
        albumName: info.albumTitle || '',
        isPlaying: info.status === 'playing',
    };
    return playbackInfo;
}

/**
 * Desktop implementation of SystemService using Electron APIs for system interactions.
 */
class DesktopSystemService extends SystemService {

    /**
     * Gets device information using cached values.
     * @returns {Promise<DeviceInfo>} Device information including OS, OS flavor, and form factor.
     */
    public async getDeviceInfo(): Promise<DeviceInfo> {
        return getDeviceInfoCached();
    }

    /**
     * Gets default system directories using cached values.
     * @returns {Promise<DefaultDirectories>} Default directories like Documents, Downloads, etc.
     */
    public async getDefaultDirectories(): Promise<DefaultDirectories> {
        return getDefaultDirectoriesCached();
    }

    /**
     * Shows an alert dialog using Electron's dialog API.
     * @param {string} title - The title of the alert.
     * @param {string} [description] - Optional description/message for the alert.
     */
    public alert(title: string, description?: string): void {
        const focusedWindow = BrowserWindow.getFocusedWindow();

        dialog.showMessageBox(focusedWindow || undefined, {
            type: 'info',
            title: title,
            message: title,
            detail: description || '',
            buttons: ['OK']
        }).catch((error) => {
            console.error('Failed to show alert dialog:', error);
        });
    }

    /**
     * Shows a custom dialog with configurable buttons using Electron's dialog API.
     * @param {NativeAskConfig} config - Configuration for the dialog including title, description, and buttons.
     * @returns {NativeAsk} Object with a close method to programmatically close the dialog.
     */
    public ask(config: NativeAskConfig): NativeAsk {
        const focusedWindow = BrowserWindow.getFocusedWindow();

        // Map button configurations to Electron dialog buttons
        const buttons = config.buttons.map(btn => btn.text);
        let defaultId = 0;
        let cancelId = 0;

        // Find default and cancel button indices
        config.buttons.forEach((btn, index) => {
            if (btn.isDefault) {
                defaultId = index;
            }
            if (btn.type === 'danger') {
                cancelId = index;
            }
        });

        let dialogClosed = false;

        // Show the dialog
        dialog.showMessageBox(focusedWindow || undefined, {
            type: 'question',
            title: config.title,
            message: config.title,
            detail: config.description || '',
            buttons: buttons,
            defaultId: defaultId,
            cancelId: cancelId,
            noLink: true
        }).then((result) => {
            if (!dialogClosed && result.response >= 0 && result.response < config.buttons.length) {
                const selectedButton = config.buttons[result.response];
                if (selectedButton.onPress) {
                    selectedButton.onPress();
                }
            }
        }).catch((error) => {
            console.error('Failed to show ask dialog:', error);
        });

        return {
            close: () => {
                dialogClosed = true;
                // Note: Electron doesn't provide a direct way to close a message box programmatically
                // The dialog will remain open until user interaction
                console.warn('Dialog close requested, but Electron MessageBox cannot be closed programmatically');
            }
        };
    }

    public async getWindowsDrives(): Promise<WinDriveDetails[]> {
        return getDriveDetails();
    }

    public async openUrl(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    public async openFile(filePath: string): Promise<void> {
        await shell.openPath(filePath);
    }

    public getAccentColorHex(): string {
        return systemPreferences.getAccentColor(); // RGBA hexadecimal form
    }

    public copyToClipboard(text: string, type: 'text' | 'link' = 'text'): void {
        // For now, we treat 'link' the same as 'text'
        clipboard.writeText(text);
    }

    @exposed
    public async canControlVolumeLevel(): Promise<boolean> {
        return true;
    }

    @exposed
    public async getVolumeLevel(): Promise<number> {
        return volumeDriver.getVolume();
    }

    @exposed
    public async setVolumeLevel(level: number): Promise<void> {
        return volumeDriver.setVolume(level);
    }

    @exposed
    public async canControlAudioPlayback(): Promise<boolean> {
        return process.platform === 'win32';
    }

    @exposed
    public async getAudioPlaybackInfo(): Promise<AudioPlaybackInfo> {
        if (process.platform === 'win32') {
            console.log('Fetching audio playback info on Windows');
            try {
                const info = mediaControlWin.getAudioPlaybackInfo();
                return winPlaybackInfoToAudioPlaybackInfo(info);
            } catch (error) {
                console.error('Error fetching audio playback info:', error);
                throw error;
            }
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async pauseAudioPlayback(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.pauseAudioPlayback();
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async playAudioPlayback(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.playAudioPlayback();
        }
        throw new Error("Not supported.");
    }

    // Battery info
    @exposed
    public async getBatteryInfo(): Promise<BatteryInfo> {
        return getBatteryInfo();
    }

    @exposed
    public async canGetBatteryInfo(): Promise<boolean> {
        return true;
    }

    @exposed
    public async nextAudioTrack(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.nextAudioTrack();
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async previousAudioTrack(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.previousAudioTrack();
        }
        throw new Error("Not supported.");
    }

    @serviceStartMethod
    public async start() {
        // We will only poll on windows
        if (process.platform === 'win32') {
            systemPreferences.on('accent-color-changed', (_ev, newColor: string) => {
                console.log('Accent color changed:', newColor);
                this.accentColorChangeSignal.dispatch(newColor);
            });
            mediaControlWin.onAudioPlaybackInfoChanged((info) => {
                console.log('Audio playback info changed:', info);
                const playbackInfo = winPlaybackInfoToAudioPlaybackInfo(info);
                this.audioPlaybackSignal.dispatch(playbackInfo);
            });
        }
        onBatteryInfoChanged((info) => {
            this.batteryInfoSignal.dispatch(info);
        });
    }

    @serviceStopMethod
    public async stop() {
        // Remove the accent color change listener
        if (process.platform === 'win32') {
            systemPreferences.removeAllListeners('accent-color-changed');
        }
        this.accentColorChangeSignal.detachAll();
    }
}

export default DesktopSystemService;
