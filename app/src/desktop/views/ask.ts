import gui from 'gui';

export default class Ask {
    private box: gui.MessageBox;
    private parentWindow: gui.Window | null = null;
    private buttonCbs: (() => void)[] = [];

    constructor(text: string, description?: string) {
        this.box = gui.MessageBox.create();
        this.box.setType('information');
        if (process.platform !== 'darwin') {
            this.box.setTitle('HomeCloud');
        }
        this.box.setText(text);
        if (description) {
            this.box.setInformativeText(description);
        }
    }

    addButton(text: string, isDefault: boolean, onPress: () => void) {
        const index = this.buttonCbs.length;
        this.box.addButton(text, index);
        if (isDefault) {
            this.box.setDefaultResponse(index);
        }
        this.buttonCbs.push(onPress);
    }

    close() {
        if (this.parentWindow) {
            this.parentWindow.close();
        }
        this.box.close();
    }

    show() {
        this.box.onResponse = (index: number) => {
            this.buttonCbs[index]();
            // cleanup
            this.box.onResponse = null;
            this.buttonCbs = [];
        };
        if (process.platform === 'darwin') {
            this.parentWindow = gui.Window.create({});
            this.box.showForWindow(this.parentWindow);
        } else {
            this.box.show();
        }
    }
}
