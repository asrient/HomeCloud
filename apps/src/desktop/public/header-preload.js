const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('info', {
    nodeVersion: process.versions.node,
    chromeVersion: process.versions.chrome,
    electronVersion: process.versions.electron,
    platform: process.platform,
});

const tabEvent = (eventName, data) => ipcRenderer.invoke('tab-header-event', eventName, data);

contextBridge.exposeInMainWorld('shell', {
    tabs: {
        newTab: () => tabEvent('new-tab', null),
        deleteTab: (tabId) => tabEvent('delete-tab', { tabId }),
        switchTab: (tabId) => tabEvent('switch-tab', { tabId }),
        getTabs: () => tabEvent('get-tabs', null),
        onUpdateConfig: (callback) => ipcRenderer.on('update-config', callback),
        onDeleteTab: (callback) => ipcRenderer.on('delete-tab', callback),
        onSwitchTab: (callback) => ipcRenderer.on('switch-tab', callback),
        onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
    },
    onFullscreen: (callback) => ipcRenderer.on('fullscreen', callback),
})
