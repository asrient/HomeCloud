const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('versions', {
    node: () => process.versions.node,
    chrome: () => process.versions.chrome,
    electron: () => process.versions.electron
    // we can also expose variables, not just functions
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
    }
})
