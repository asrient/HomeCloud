import { app } from 'electron';
import { AppService } from 'shared/appService';
import { exposed } from 'shared/servicePrimatives';

const AUTO_START_KEY = 'pref.autoStart';

export default class DesktopAppService extends AppService {
    /**
     * Check if the app is set to open at login
     */
    @exposed
    public override async isAutoStartEnabled(): Promise<boolean | null> {
        if (process.platform === 'linux') {
            // Linux doesn't support getLoginItemSettings reliably
            // We'd need to check for .desktop file in autostart directory
            return null; // Indicate unsupported
        }
        const settings = app.getLoginItemSettings();

        if (process.platform === 'darwin') {
            // On macOS, check status instead of openAtLogin when args are used
            return (settings.status === 'enabled');
        }

        if (process.platform === 'win32') {
            // On Windows, executableWillLaunchAtLogin ignores args option
            return settings.executableWillLaunchAtLogin;
        }

        return settings.openAtLogin;
    }

    /**
     * Enable or disable auto-start at login
     * @param enable - Whether to enable auto-start
     * @param openInBackground - Whether to open hidden/minimized (default: true)
     */
    @exposed
    public override async setAutoStart(enable: boolean, openInBackground: boolean = true): Promise<void> {
        if (process.platform === 'linux') {
            // Linux requires creating a .desktop file - not implemented
            console.warn('Auto-start on Linux requires manual .desktop file setup');
            return;
        }

        const options: Electron.Settings = {
            openAtLogin: enable,
            // On Windows, this opens the app minimized
            openAsHidden: enable && openInBackground,
        };

        // On macOS, we can also set args to indicate background start
        if (process.platform === 'darwin' && enable && openInBackground) {
            options.args = ['--hidden'];
        }

        // On Windows with Squirrel, we need different approach
        if (process.platform === 'win32') {
            options.args = enable && openInBackground ? ['--hidden'] : [];
        }

        app.setLoginItemSettings(options);
        // Store the preference in our config as well for consistency
        this.store.setItem(AUTO_START_KEY, enable);
        await this.store.save();
        console.log(`Auto-start ${enable ? 'enabled' : 'disabled'} (background: ${openInBackground})`);
    }

    /**
     * Toggle auto-start setting
     */
    @exposed
    public override async toggleAutoStart(): Promise<boolean | null> {
        const currentState = await this.isAutoStartEnabled();
        await this.setAutoStart(!currentState);
        return !currentState;
    }

    async init() {
        await super.init();
        const localSc = modules.getLocalServiceController();
        localSc.account.accountLinkSignal.add(async (linked) => {
            if (linked) {
                const pref = this.store.getItem<boolean>(AUTO_START_KEY);
                // Unless user explicitly disabled auto-start, enable it upon account link.
                if ((pref !== false)) {
                    const isEnabled = await this.isAutoStartEnabled();
                    if (isEnabled === false) { // Rule out unsupported (null) and already enabled (true)
                        console.log("[AppService] Enabling app auto-start due to account link.");
                        await this.setAutoStart(true);
                    } else {
                        console.log("[AppService] Auto-start already enabled or unsupported; no action taken.");
                    }
                }
            }
        });
    }
}
