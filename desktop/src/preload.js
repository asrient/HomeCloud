// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//const { contextBridge } = require('electron');
const { getGlobal } = require('@electron/remote');
const { webUtils } = require('electron');

//contextBridge.exposeInMainWorld('getModules', () => getGlobal('modules'));

window.modules = getGlobal('modules');
window.utils = {
    getPathForFile: webUtils.getPathForFile,
    openContextMenu: require('@electron/remote').require('./contextMenu').openContextMenu
}
