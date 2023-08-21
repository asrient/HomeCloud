import { app, BrowserWindow, protocol, net, BrowserView } from 'electron';
import path from 'path';
import isDev from "electron-is-dev";

const headerHeight = 46;

export class AppWindow {
    win: BrowserWindow;
    id: number;

    constructor(preloadScript: string | null = null) {
        // Create the browser window.
        const opts: any = {};
        if (!!preloadScript) {
            opts['webPreferences'] = {
                preload: preloadScript,
            };
        }
        this.win = new BrowserWindow({
            width: 800,
            height: 600,
            ...opts,
        });
        this.id = this.win.webContents.id;
    };

    openDevTools(force = false) {
        if (force || isDev) {
            this.win.webContents.openDevTools();
        }
    }

    loadFile(filePath: string) {
        this.win.webContents.loadFile(filePath);
    }

    loadURL(url: string) {
        this.win.webContents.loadURL(url);
    }

    isDestroyed() {
        return this.win.webContents.isDestroyed();
    }
}

export type TabConfigType = {
    themeColor: string;
    title: string;
    icon: string;
    id: number;
}

export class WindowTab {
    view: BrowserView;
    parent: BrowserWindow;
    id: number;
    cb: Function | null = null;
    config: TabConfigType = {
        themeColor: '#000000',
        title: 'New Tab',
        icon: '',
        id: -1,
    };
    constructor(parent: BrowserWindow, url: string | null = null, cb: Function | null = null) {
        this.parent = parent;
        this.view = new BrowserView({
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                scrollBounce: true,
            },
        });
        this.id = this.view.webContents.id;
        this.setAsActive();
        this.fixBounds();
        this.cb = cb;
        this.attachEventHandlers();
        this.loadURL(url || 'bundle://index.html');
        this.config.id = this.id;
        this.view.webContents.openDevTools();
        this.config.title = this.view.webContents.getTitle() || 'New Tab';
    }

    isDestroyed() {
        return this.view.webContents.isDestroyed();
    }

    passEvent(eventName: string, data: any) {
        if (!!this.cb) {
            this.cb(this.id, eventName, data);
        }
    }

    attachEventHandlers() {
        this.view.webContents.on('destroyed', () => {
            this.passEvent('destroyed', null);
        });
        this.view.webContents.on('page-title-updated', () => {
            this.config.title = this.view.webContents.getTitle();
            this.passEvent('update-config', this.config);
        });
        this.view.webContents.on('did-finish-load', () => {
            this.config.title = this.view.webContents.getTitle();
            this.passEvent('update-config', this.config);
        });
        this.view.webContents.on('page-favicon-updated', (event, favicons) => {
            this.config.icon = favicons[0];
            this.passEvent('update-config', this.config);
        });
        this.view.webContents.on('did-change-theme-color', (event, color) => {
            this.config.themeColor = color || '#000000';
            this.passEvent('update-config', this.config);
        });
    }

    loadFile(filePath: string) {
        this.view.webContents.loadFile(filePath);
    }

    loadURL(url: string) {
        this.view.webContents.loadURL(url);
    }

    setAsActive() {
        if(this.isDestroyed()) return;
        if(!this.parent || this.parent.isDestroyed()) return;
        this.parent.setBrowserView(this.view);
        this.fixBounds();
    }

    fixBounds() {
        const parentBounds = this.parent.getBounds();
        this.view.setBounds({ x: 0, y: headerHeight, width: parentBounds.width, height: (parentBounds.height - headerHeight) });
    }
}

export class TabbedAppWindow extends AppWindow {
    tabs: {[index: number]: WindowTab} = {};
    activeTabId: number = -1;
    lastHandle: NodeJS.Timeout | null = null;

    constructor() {
        super(path.join(__dirname, 'public/header-preload.js'));
        this.loadFile(path.join(__dirname, 'public/app-header.html'));
        this.createNewTab();
        // https://github.com/electron/electron/issues/22174
        this.win.on("resize", this.handleWindowResize);
        this.win.webContents.on('destroyed', () => {
            // release all tabs and resources
            console.log('window destroyed, releasing all tabs..');
            this.win.webContents.removeAllListeners();
            Object.keys(this.tabs).map(Number).forEach((tabId) => {
                this.deleteTab(tabId);
            });
        });
    }

    handleWindowResize = (e: any) => {
        e.preventDefault();
        // the setTimeout is necessary because it runs after the event listener is handled
        this.lastHandle = setTimeout(() => {
            if (this.lastHandle != null) clearTimeout(this.lastHandle);
            if (this.activeTabId >= 0 && !this.tabs[this.activeTabId].isDestroyed()) {
                this.tabs[this.activeTabId].fixBounds();
            }
        });
    };

    createNewTab(url: string | null = null) {
        if(this.isDestroyed()) return;
        const tab = new WindowTab(this.win, url, this.handleTabHtmlEvent);
        this.tabs[tab.id] = tab;
        console.log('new tab created:', tab.id);
        this.win.webContents.send('new-tab', tab.config);
        this.switchTab(tab.id);
    }

    handleTabHtmlEvent = (tabId: number, eventName: string, data: any) => {
        if (!this.tabs[tabId]) return;
        if (eventName === 'destroyed') {
            console.log('destroyed/crashed tab:', tabId);
            this.deleteTab(tabId);
        } else if (eventName === 'update-config') {
            console.log('update-config', tabId, data);
            this.win.webContents.send('update-config', tabId, data);
        }
    }

    handleTabHeaderEvent = (eventName: string, data: any) => {
        console.log('handleTabHeaderEvent:', eventName, data);
        switch (eventName) {
            case 'new-tab':
                return this.createNewTab();
            case 'switch-tab':
                return this.switchTab(data.tabId, true);
            case 'delete-tab':
                return this.deleteTab(data.tabId, true);
            case 'get-tabs':
                return Object.keys(this.tabs).map(Number).map((tabId) => this.tabs[tabId].config);
            default:
                break;
        }
    }

    switchTab(tabId: number, fromHeader: boolean = false) {
        console.log('switchTab', tabId);
        if(!this.tabs[tabId]) {
            console.warn('switchTab: tab not found', tabId);
            return;
        }
        this.tabs[tabId].setAsActive();
        this.activeTabId = tabId;
        if(!fromHeader && !this.isDestroyed()) this.win.webContents.send('switch-tab', tabId);
    }
    deleteTab(tabId: number, fromHeader: boolean = false) {
        if(!this.tabs[tabId]) return;
        if (!this.tabs[tabId].isDestroyed()) {
            this.tabs[tabId].view.webContents.close();
        }
        delete this.tabs[tabId];
        if(this.isDestroyed()) return;
        if (this.activeTabId === tabId) {
            if (Object.keys(this.tabs).length == 0) {
                this.createNewTab();
            }
        }
        if(!fromHeader) this.win.webContents.send('delete-tab', tabId);
    }
}
