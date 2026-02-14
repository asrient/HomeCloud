// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//const { contextBridge } = require('electron');
const { getGlobal } = require('@electron/remote');
// Import only those modules that are available in renderer process here.
const { webUtils } = require('electron');

//contextBridge.exposeInMainWorld('getModules', () => getGlobal('modules'));

const desktopWebUtils = require('@electron/remote').require('./desktopWebUtils');

window.modules = getGlobal('modules');
window.utils = {
    getPathForFile: webUtils.getPathForFile,
    openContextMenu: desktopWebUtils.openContextMenu,
    clipboardHasFiles: desktopWebUtils.clipboardHasFiles,
    checkForUpdates: desktopWebUtils.checkForUpdates,
    getUpdateStatus: desktopWebUtils.getUpdateStatus,
}
