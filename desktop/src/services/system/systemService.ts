import { SystemService } from "shared/services/systemService";
import { DeviceInfo, NativeAskConfig, NativeAsk, DefaultDirectories } from "shared/types";
import { getDefaultDirectoriesCached, getDeviceInfoCached } from "./deviceInfo";
import { dialog, BrowserWindow } from "electron";
import { getDriveDetails } from "./drivers/win32";
import { WinDriveDetails } from "../../types";

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
}

export default DesktopSystemService;
