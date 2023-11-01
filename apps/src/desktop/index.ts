import { app } from "electron";
import App from "./shell/app";
import MessageHandlers from "./shell/messageHandlers";

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit()
}
else {
    const homecloudApp = new App();
    const messageHandlers = new MessageHandlers(homecloudApp);
    messageHandlers.attach();
}
