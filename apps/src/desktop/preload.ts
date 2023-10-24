// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("config", {
  nodeVersion: process.versions.node,
  chromeVersion: process.versions.chrome,
  electronVersion: process.versions.electron,
  platform: process.platform,
});

contextBridge.exposeInMainWorld("isDesktopApp", true);

contextBridge.exposeInMainWorld("appEvent", {
  listen: (eventName: string, callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => {
      callback(data);
    }
    ipcRenderer.on(`server-event:${eventName}`, listener);
    return () => {
      ipcRenderer.removeListener(`server-event:${eventName}`, listener);
    }
  }
});
