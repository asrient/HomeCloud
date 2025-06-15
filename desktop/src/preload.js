// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
//const { contextBridge } = require('electron');
const { getGlobal } = require('@electron/remote');

//contextBridge.exposeInMainWorld('getModules', () => getGlobal('modules'));

window.modules = getGlobal('modules');
