import path from 'path'
import gui from 'gui'
import { envConfig } from '../../core/index'
import { getAssetPath, openApp } from '../utils'

export default class Tray {
    trayIcon: gui.Image;
    tray: gui.Tray;
    quitHandler: () => void;
    constructor(quitHandler: () => void) {
        this.quitHandler = quitHandler;
        const iconName = process.platform == 'darwin' ? 'iconTemplate.png' : 'icon.png';
        const iconPath = path.join(getAssetPath(), 'appIcons', iconName);
        console.log('tray icon path:', iconPath);
        this.trayIcon = gui.Image.createFromPath(iconPath);
        if (process.platform == 'darwin')
            this.trayIcon.setTemplate(true);
        this.tray = gui.Tray.createWithImage(this.trayIcon);
        if (process.platform == 'linux') {
            this.tray.setTitle('HomeCloud');
        } else if (process.platform == 'darwin') {
            this.tray.setTitle('HomeCloud - starting..');
        }
        const menu = gui.Menu.create([
            {
                label: 'Show App',
                onClick: () => {
                    const webUrl = envConfig.BASE_URL;
                    openApp(webUrl);
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                onClick: () => {
                    this.quitHandler();
                }
            },
        ])
        this.tray.setMenu(menu);

        // on windows, menu shows on right click only, open app on left click.
        if (process.platform == 'win32') {
            this.tray.onClick = () => {
                const webUrl = envConfig.BASE_URL;
                openApp(webUrl);
            }
        }
    }

    remove() {
        this.tray.remove();
    }

    setStatus(status: string) {
        if (process.platform != 'darwin') return;
        this.tray.setTitle(`HomeCloud - ${status}`);
    }
}
