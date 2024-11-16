import gui from 'gui';

export function catchUnhandledErrors() {
    process.on('uncaughtException', crash);
    process.on('unhandledRejection', crash);
}

export function crash(error: Error | string) {
    console.error('System Crashed:', error);
    const dialog = gui.MessageBox.create();
    dialog.setType('error');
    if (process.platform !== 'darwin')
        dialog.setTitle('HomeCloud Crashed');
    const txt = typeof error === 'string' ? error : error.message;
    dialog.setText(txt);
    if (typeof error !== 'string')
        dialog.setInformativeText(error.stack);
    dialog.addButton('Copy message', 0);
    dialog.setDefaultResponse(0);
    dialog.addButton('Close', -1);
    if (dialog.run() == 0) {
        const text = typeof error === 'string' ? error : `${error.message}\n${error.stack}`;
        gui.Clipboard.get().setText(text);
    }
    console.log('App is shutting down..');
    gui.MessageLoop.quit();
    process.exit(1);
}
