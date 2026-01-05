import { SystemService } from "shared/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, AudioPlaybackInfo, BatteryInfo, Disk, ClipboardContent } from "shared/types";
import { getDefaultDirectoriesCached, getDeviceInfoCached } from "./deviceInfo";
import { dialog, BrowserWindow, shell, systemPreferences, clipboard } from "electron";
import { getDriveDetails } from "./drivers/win32";
import { WinDriveDetails, WinDriveType } from "../../types";
import { exposed, serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import volumeDriver from "./volumeControl";
import * as mediaControlWin from "./mediaControl/win32";
import { getBatteryInfo, onBatteryInfoChanged } from "./batteryLevel";
// Need to use require for this module as it does not have proper ES module support
const nodeDiskInfo = require('node-disk-info');
import path from "path";
import { MacOSPlaybackWatcher } from "./mediaControl/mac";
import { LinuxPlaybackWatcher } from "./mediaControl/linux";

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

    private macPlaybackWatcher: MacOSPlaybackWatcher | null = null;
    private linuxPlaybackWatcher: LinuxPlaybackWatcher | null = null;

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

    public copyToClipboard(text: string, type: 'text' | 'link' | 'html' | 'rtf' = 'text'): void {
        switch (type) {
            case 'text':
            case 'link':
                clipboard.writeText(text);
                break;
            case 'html':
                clipboard.writeHTML(text);
                break;
            case 'rtf':
                clipboard.writeRTF(text);
                break;
            default:
                console.warn(`Unsupported clipboard type: ${type}. Defaulting to text.`);
                clipboard.writeText(text);
        }
    }

    @exposed
    public async readClipboard(): Promise<ClipboardContent | null> {
        const availableFormats = clipboard.availableFormats();
        if (availableFormats.includes('text/html')) {
            const htmlContent = clipboard.readHTML();
            return { type: 'html', content: htmlContent };
        } else if (availableFormats.includes('text/rtf')) {
            const rtfContent = clipboard.readRTF();
            return { type: 'rtf', content: rtfContent };
        } else if (availableFormats.includes('text/plain')) {
            const textContent = clipboard.readText();
            let type: 'text' | 'link' = 'text';
            // Simple heuristic to check if the text is a URL
            if (/^(https?:\/\/|www\.)/.test(textContent.trim())) {
                type = 'link';
            }
            return { type, content: textContent };
        }
        return null;
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
        return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
    }

    @exposed
    public async getAudioPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        if (process.platform === 'win32') {
            console.log('Fetching audio playback info on Windows');
            try {
                const info = mediaControlWin.getAudioPlaybackInfo();
                return winPlaybackInfoToAudioPlaybackInfo(info);
            } catch (error) {
                console.error('Error fetching audio playback info:', error);
                return null;
            }
        } else if (process.platform === 'darwin') {
            if (!this.macPlaybackWatcher) {
                throw new Error('MacOSPlaybackWatcher not initialized');
            }
            const info = await this.macPlaybackWatcher.getPlaybackInfo();
            return info;
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.getPlaybackInfo();
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async pauseAudioPlayback(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.pauseAudioPlayback();
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.pause();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.pause();
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async playAudioPlayback(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.playAudioPlayback();
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.play();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.play();
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
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.next();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.next();
        }
        throw new Error("Not supported.");
    }

    @exposed
    public async previousAudioTrack(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.previousAudioTrack();
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.previous();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.previous();
        }
        throw new Error("Not supported.");
    }

    // Disks
    @exposed
    public async listDisks(): Promise<Disk[]> {
        if (process.platform === 'win32') {
            const drives = await this.getWindowsDrives();
            return drives.map(drive => {
                let type: 'internal' | 'external' = 'internal';
                if (drive.type === WinDriveType.DRIVE_CDROM || drive.type === WinDriveType.DRIVE_REMOTE || drive.type === WinDriveType.DRIVE_REMOVABLE) {
                    type = 'external';
                }
                const letter = drive.path.replace('\\', '');
                const name = `${drive.name} (${letter})`;
                const disk: Disk = {
                    type,
                    path: drive.path,
                    name,
                    size: drive.totalSpace,
                    free: drive.freeSpace,
                };
                return disk;
            });
        }
        else if (process.platform === 'linux' || process.platform === 'darwin') {
            const disks: Disk[] = [];

            const diskInfos = await nodeDiskInfo.getDiskInfo();
            const linuxPermitedDriveLocations = ['/media/', '/mnt/', '/run/media/'];
            for (const info of diskInfos) {
                let isExternal = false;
                let location = info.mounted;
                let name = path.basename(location);
                // Filter out irrelevant file systems
                if (info.filesystem.startsWith('dev') || info.filesystem === 'tmpfs' || info.filesystem === 'overlay') {
                    continue;
                }
                if (process.platform === 'linux') {
                    // Check if the mount point is under permitted locations
                    let permitted = false;
                    for (const permitedLocation of linuxPermitedDriveLocations) {
                        if (location.startsWith(permitedLocation)) {
                            permitted = true;
                            break;
                        }
                    }
                    if (!permitted && location !== '/') {
                        continue; // Skip non-permitted locations except root
                    }
                }
                if (process.platform === 'darwin' && (info.mounted.startsWith('/System/') || !info.mounted.startsWith('/'))) {
                    continue; // Skip System volumes and non-root volumes on macOS
                }
                if (name === '') {
                    if (process.platform === 'linux') {
                        name = 'Hard Disk';
                    } else {
                        name = 'Macintosh HD';
                    }
                }
                if (location !== '/') {
                    isExternal = true;
                }
                const disk: Disk = {
                    type: isExternal ? 'external' : 'internal',
                    name,
                    path: location,
                    size: info.blocks * 1024,
                    free: info.available * 1024,
                };
                disks.push(disk);
            }
            return disks;
        }
        throw new Error("Not supported.");
    }

    @serviceStartMethod
    public async start() {
        if (process.platform === 'win32') {
            // Accent color change listener only for Windows
            systemPreferences.on('accent-color-changed', (_ev, newColor: string) => {
                console.log('Accent color changed:', newColor);
                this.accentColorChangeSignal.dispatch(newColor);
            });
            mediaControlWin.onAudioPlaybackInfoChanged((info) => {
                console.log('Audio playback info changed:', info);
                const playbackInfo = winPlaybackInfoToAudioPlaybackInfo(info);
                this.audioPlaybackSignal.dispatch(playbackInfo);
            });
        } else if (process.platform === 'darwin') {
            this.macPlaybackWatcher = new MacOSPlaybackWatcher((info) => {
                console.log('Audio playback info changed (macOS):', info);
                this.audioPlaybackSignal.dispatch(info);
            });
        } else if (process.platform === 'linux') {
            this.linuxPlaybackWatcher = new LinuxPlaybackWatcher((info) => {
                console.log('Audio playback info changed (Linux):', info);
                this.audioPlaybackSignal.dispatch(info);
            });
        }

        // Battery info change listener
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
