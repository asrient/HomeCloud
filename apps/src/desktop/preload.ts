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

contextBridge.exposeInMainWorld("app", {
  onServerEvent: (callback: Function) =>
    ipcRenderer.on("server-event", (_event, type, data) => {
      callback(type, data);
    }),
});
