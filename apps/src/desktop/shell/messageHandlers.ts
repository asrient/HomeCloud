import { IpcMainInvokeEvent, ipcMain } from "electron";
import App from "./app";

export default class MessageHandlers {
  app: App;
  constructor(app: App) {
    this.app = app;
  }

  attach() {
    ipcMain.handle("tab-header-event", this.tabHeaderEvent);
  }

  tabHeaderEvent = (
    event: IpcMainInvokeEvent,
    eventName: string,
    data: any,
  ) => {
    const window = this.app.tabbedWindows.find((w) => w.id === event.sender.id);
    if (window) {
      return window.handleTabHeaderEvent(eventName, data);
    }
  };
}
