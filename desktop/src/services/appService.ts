import { app } from 'electron';
import { AppService } from 'shared/appService';
import { exposed } from 'shared/servicePrimatives';
import { UserPreferences } from '../types';
import { isAppContainerWin, getStartupTaskState, requestEnableStartupTask, disableStartupTask } from '../appContainer';

const AUTO_START_KEY = 'pref.autoStart';
const MSIX_STARTUP_TASK_ID = 'HomeCloudStartup';

const USER_PREFERENCE_KEYS = Object.values(UserPreferences);

/**
 * Check if we're running as an MSIX package.
 */
function isMsixPackage(): boolean {
    return isAppContainerWin();
}

export default class DesktopAppService extends AppService {
    /**
     * Check if the app is set to open at login.
     * On MSIX, uses WinRT StartupTask API.
     * On Squirrel/dev, uses Electron's getLoginItemSettings.
     */
    @exposed
    public override async isAutoStartEnabled(): Promise<boolean | null> {
        if (process.platform === 'linux') {
            return null; // Unsupported
        }

        // MSIX: Use WinRT StartupTask
        if (isMsixPackage()) {
            const state = getStartupTaskState(MSIX_STARTUP_TASK_ID);
            console.log(`[AppService] MSIX StartupTask state: ${state}`);
            return state === 'enabled' || state === 'enabledByPolicy';
        }

        const settings = app.getLoginItemSettings();
        console.log(`[AppService] Electron login item settings:`, JSON.stringify(settings));

        if (process.platform === 'darwin') {
            return (settings.status === 'enabled');
        }

        if (process.platform === 'win32') {
            return settings.executableWillLaunchAtLogin;
        }

        return settings.openAtLogin;
    }

    /**
     * Enable or disable auto-start at login.
     * On MSIX, uses WinRT StartupTask API.
     * On Squirrel/dev, uses Electron's setLoginItemSettings.
     *
     * Note: On MSIX, if the user manually disabled startup in
     * Settings > Apps > Startup, the state becomes "disabledByUser"
     * and the app cannot re-enable it programmatically.
     */
    @exposed
    public override async setAutoStart(enable: boolean, openInBackground: boolean = true): Promise<void> {
        if (process.platform === 'linux') {
            console.warn('Auto-start on Linux requires manual .desktop file setup');
            return;
        }

        // MSIX: Use WinRT StartupTask
        if (isMsixPackage()) {
            if (enable) {
                const resultState = requestEnableStartupTask(MSIX_STARTUP_TASK_ID);
                console.log(`[AppService] MSIX StartupTask enable result: ${resultState}`);
                if (resultState === 'disabledByUser') {
                    console.warn('[AppService] User has disabled startup in Windows Settings. Cannot re-enable programmatically.');
                }
            } else {
                disableStartupTask(MSIX_STARTUP_TASK_ID);
                console.log('[AppService] MSIX StartupTask disabled');
            }
            this.store.setItem(AUTO_START_KEY, enable);
            await this.store.save();
            return;
        }

        const options: Electron.Settings = {
            openAtLogin: enable,
            openAsHidden: enable && openInBackground,
        };

        if (process.platform === 'darwin' && enable && openInBackground) {
            options.args = ['--hidden'];
        }

        if (process.platform === 'win32') {
            options.args = enable && openInBackground ? ['--hidden'] : [];
        }

        app.setLoginItemSettings(options);
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

    protected override isUserPrefKey(key: string): boolean {
        return USER_PREFERENCE_KEYS.includes(key as UserPreferences);
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
