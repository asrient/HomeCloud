import { SystemService } from "shared/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories, AudioPlaybackInfo, BatteryInfo, Disk, ClipboardContent, ClipboardContentType, ClipboardFile, ScreenLockStatus } from "shared/types";
import { dialog, BrowserWindow, shell, systemPreferences, clipboard, ShareMenu, SharingItem, powerMonitor } from "electron";
import { getDriveDetails } from "./drivers/win32";
import { WinDriveDetails, WinDriveType } from "../../types";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import volumeDriver from "./volumeControl";
import * as mediaControlWin from "./mediaControl/win32";
import { getBatteryInfo, onBatteryInfoChanged } from "./batteryLevel";
import path from "path";
import { execSync } from "child_process";
import { getOSType, getOSFlavour, getFormFactor, getUnixDisks } from "nodeShared/deviceInfo";

import { MacOSPlaybackWatcher } from "./mediaControl/mac";
import { LinuxPlaybackWatcher } from "./mediaControl/linux";
import { writeFilePathsToClipboard, readFilePathsFromClipboard } from "./clipboard";

import os from "os";
import { app } from "electron";


function getDefaultDirectories(): DefaultDirectories {
    const directories: DefaultDirectories = {
        Pictures: null,
        Documents: null,
        Downloads: null,
        Videos: null,
        Movies: null,
        Music: null,
        Desktop: null,
    };

    // Use Electron's app.getPath() for standard directories
    directories.Documents = app.getPath('documents');
    directories.Downloads = app.getPath('downloads');
    directories.Pictures = app.getPath('pictures');
    directories.Music = app.getPath('music');
    directories.Videos = app.getPath('videos');
    directories.Desktop = app.getPath('desktop');

    // For Movies directory, fallback to Videos or manual path
    if (os.platform() === 'darwin') {
        // On macOS, Movies is typically separate from Videos
        directories.Movies = path.join(os.homedir(), 'Movies');
    } else {
        // On Windows/Linux, Movies typically equals Videos
        directories.Movies = directories.Videos;
    }
    return directories;
}

let _defaultDirectories: DefaultDirectories | null = null;
function getDefaultDirectoriesCached(): DefaultDirectories {
    if (!_defaultDirectories) {
        _defaultDirectories = getDefaultDirectories();
    }
    return _defaultDirectories;
}


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
    private _deviceInfo: DeviceInfo | null = null;

    /**
     * Gets device information using cached values.
     * @returns {Promise<DeviceInfo>} Device information including OS, OS flavor, and form factor.
     */
    public async getDeviceInfo(): Promise<DeviceInfo> {
        if (!this._deviceInfo) {
            this._deviceInfo = {
                os: getOSType(),
                osFlavour: getOSFlavour(),
                formFactor: getFormFactor(),
            };
        }
        return this._deviceInfo;
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
            console.error('[SystemService] Failed to show alert dialog:', error);
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
            console.error('[SystemService] Failed to show ask dialog:', error);
        });

        return {
            close: () => {
                dialogClosed = true;
                // Note: Electron doesn't provide a direct way to close a message box programmatically
                // The dialog will remain open until user interaction
                console.warn('[SystemService] Dialog close requested, but Electron MessageBox cannot be closed programmatically');
            }
        };
    }

    public async getWindowsDrives(): Promise<WinDriveDetails[]> {
        return getDriveDetails();
    }

    protected override async _openUrl(url: string): Promise<void> {
        await shell.openExternal(url);
    }

    protected override async _openFile(filePath: string): Promise<void> {
        await shell.openPath(filePath);
    }

    protected override async _lockScreen(): Promise<void> {
        const os = process.platform;
        console.log('[lockScreen] platform:', os);
        if (os === 'darwin') {
            // macOS: use pmset to lock (activates lock screen immediately)
            try {
                const result = execSync('pmset displaysleepnow', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
                console.log('[lockScreen] pmset stdout:', result);
            } catch (err: any) {
                console.error('[lockScreen] pmset failed:', err.message);
                console.error('[lockScreen] stderr:', err.stderr?.toString());
                console.error('[lockScreen] status:', err.status);
                throw err;
            }
        } else if (os === 'win32') {
            // Windows: LockWorkStation via rundll32
            execSync('rundll32.exe user32.dll,LockWorkStation');
        } else {
            // Linux: try common screen lockers
            try { execSync('loginctl lock-session'); } catch {
                try { execSync('xdg-screensaver lock'); } catch {
                    throw new Error('Could not lock screen on this platform');
                }
            }
        }
    }

    protected override async _getScreenLockStatus(): Promise<ScreenLockStatus> {
        const os = process.platform;
        try {
            if (os === 'darwin') {
                // macOS: check if screen is locked via ioreg
                const output = execSync('ioreg -n Root -d1 -a', { encoding: 'utf8' });
                // If CGSSessionScreenIsLocked is true, screen is locked
                if (output.includes('CGSSessionScreenIsLocked') && output.includes('<true/>')) {
                    return 'locked';
                }
                return 'unlocked';
            } else if (os === 'win32') {
                // Windows: check if LogonUI.exe is running (indicates lock screen)
                const output = execSync('tasklist /FI "IMAGENAME eq LogonUI.exe" /NH', { encoding: 'utf8' });
                if (output.includes('LogonUI.exe')) {
                    return 'locked';
                }
                return 'unlocked';
            } else {
                // Linux: try loginctl
                const output = execSync('loginctl show-session $(loginctl | grep $(whoami) | awk \'{print $1}\') -p LockedHint --value', { encoding: 'utf8' });
                return output.trim() === 'yes' ? 'locked' : 'unlocked';
            }
        } catch {
            return 'not-supported';
        }
    }

    public getAccentColorHex(): string {
        return systemPreferences.getAccentColor(); // RGBA hexadecimal form
    }

    public copyToClipboard(content: string | ClipboardFile[], type: ClipboardContentType = 'text'): void {
        const text = typeof content === 'string' ? content : '';
        switch (type) {
            case 'filePath':
                if (typeof content !== 'string') {
                    writeFilePathsToClipboard(content);
                }
                break;
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
                console.warn(`[SystemService] Unsupported clipboard type: ${type}. Defaulting to text.`);
                clipboard.writeText(text);
        }
    }

    protected override async _readClipboard(type?: ClipboardContentType): Promise<ClipboardContent | null> {
        let availableFormats = clipboard.availableFormats();
        const isTypeAllowed = (type_: string): boolean => {
            return !type || type === type_;
        };

        // Check for file paths first using platform-specific methods
        if (isTypeAllowed('filePath')) {
            const files = readFilePathsFromClipboard();
            if (files && files.length > 0) {
                return { type: 'filePath', content: files.map(f => f.path).join('\n'), files };
            }
        }

        // Check for images
        let hasImage = availableFormats.findIndex(format => format.startsWith('image/')) !== -1;
        if (hasImage) {
            const image = clipboard.readImage();
            if (!image.isEmpty()) {
                return { type: 'image', content: image.toDataURL() };
            }
        }

        if (availableFormats.includes('text/html') && isTypeAllowed('html')) {
            const htmlContent = clipboard.readHTML();
            if (htmlContent) {
                return { type: 'html', content: htmlContent };
            }
        }
        if (availableFormats.includes('text/rtf') && isTypeAllowed('rtf')) {
            const rtfContent = clipboard.readRTF();
            if (rtfContent) {
                return { type: 'rtf', content: rtfContent };
            }
        }
        if (availableFormats.includes('text/plain') && (isTypeAllowed('text') || isTypeAllowed('link'))) {
            const textContent = clipboard.readText();
            if (textContent) {
                let type_: 'text' | 'link' = 'text';
                // Simple heuristic to check if the text is a URL
                if (/^(https?:\/\/|www\.)/.test(textContent.trim())) {
                    type_ = 'link';
                }
                return { type: type || type_, content: textContent };
            }
        }
        return null;
    }

    protected override async _canControlVolumeLevel(): Promise<boolean> {
        return true;
    }

    protected override async _getVolumeLevel(): Promise<number> {
        return volumeDriver.getVolume();
    }

    protected override async _setVolumeLevel(level: number): Promise<void> {
        return volumeDriver.setVolume(level);
    }

    protected override async _canControlAudioPlayback(): Promise<boolean> {
        return process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux';
    }

    protected override async _getAudioPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        if (process.platform === 'win32') {
            // console.log('Fetching audio playback info on Windows');
            try {
                const info = mediaControlWin.getAudioPlaybackInfo();
                return winPlaybackInfoToAudioPlaybackInfo(info);
            } catch (error) {
                // console.error('Error fetching audio playback info:', error);
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

    protected override async _pauseAudioPlayback(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.pauseAudioPlayback();
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.pause();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.pause();
        }
        throw new Error("Not supported.");
    }

    protected override async _playAudioPlayback(): Promise<void> {
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
    protected override async _getBatteryInfo(): Promise<BatteryInfo> {
        return getBatteryInfo();
    }

    protected override async _canGetBatteryInfo(): Promise<boolean> {
        return true;
    }

    protected override async _nextAudioTrack(): Promise<void> {
        if (process.platform === 'win32') {
            return mediaControlWin.nextAudioTrack();
        } else if (process.platform === 'darwin' && this.macPlaybackWatcher) {
            return this.macPlaybackWatcher.next();
        } else if (process.platform === 'linux' && this.linuxPlaybackWatcher) {
            return this.linuxPlaybackWatcher.next();
        }
        throw new Error("Not supported.");
    }

    protected override async _previousAudioTrack(): Promise<void> {
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
    protected override async _listDisks(): Promise<Disk[]> {
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
            return getUnixDisks();
        }
        throw new Error("Not supported.");
    }

    public async share(options: { title?: string; description?: string; content?: string; files?: string[]; type: "url" | "text" | "file"; }): Promise<void> {
        // only available on macOS.
        if (process.platform !== 'darwin') {
            throw new Error("Sharing is only supported on macOS.");
        }
        const focusedWindow = BrowserWindow.getFocusedWindow();
        const sharingItem: SharingItem = {};

        if (options.type === 'file' && options.files) {
            sharingItem.filePaths = options.files;
        } else if (options.type === 'text' && options.content) {
            sharingItem.texts = [options.content];
        } else if (options.type === 'url' && options.content) {
            sharingItem.urls = [options.content];
        } else {
            throw new Error("Invalid share options.");
        }

        const shareMenu = new ShareMenu(sharingItem);

        shareMenu.popup({
            window: focusedWindow || undefined,
        });
    }

    @serviceStartMethod
    public async start() {
        if (process.platform === 'win32') {
            // Accent color change listener only for Windows
            systemPreferences.on('accent-color-changed', (_ev, newColor: string) => {
                console.debug('[SystemService] Accent color changed.');
                this.accentColorChangeSignal.dispatch(newColor);
            });
            mediaControlWin.onAudioPlaybackInfoChanged((info) => {
                // console.log('Audio playback info changed:', info);
                const playbackInfo = winPlaybackInfoToAudioPlaybackInfo(info);
                this.audioPlaybackSignal.dispatch(playbackInfo);
            });
        } else if (process.platform === 'darwin') {
            this.macPlaybackWatcher = new MacOSPlaybackWatcher((info) => {
                // console.log('Audio playback info changed (macOS):', info);
                this.audioPlaybackSignal.dispatch(info);
            });
        } else if (process.platform === 'linux') {
            this.linuxPlaybackWatcher = new LinuxPlaybackWatcher((info) => {
                // console.log('Audio playback info changed (Linux):', info);
                this.audioPlaybackSignal.dispatch(info);
            });
        }

        // Battery info change listener
        onBatteryInfoChanged((info) => {
            this.batteryInfoSignal.dispatch(info);
        });

        // Screen lock/unlock listener
        powerMonitor.on('lock-screen', () => {
            this.screenLockSignal.dispatch('locked');
        });
        powerMonitor.on('unlock-screen', () => {
            this.screenLockSignal.dispatch('unlocked');
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
