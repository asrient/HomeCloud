import gui from 'gui';

export default class Ask {
    private window: gui.Window;
    private footer: gui.Container;
    private onCloseCb: (() => void) | null = null;

    constructor(text: string, description?: string) {
        this.window = gui.Window.create({});
        this.window.setContentSize({ height: 150, width: 400 });
        this.window.setResizable(false);
        this.window.setAlwaysOnTop(true);
        this.window.setMaximizable(false);
        this.window.setTitle('HomeCloud');
        const body = gui.Container.create();
        body.setStyle({ flexDirection: 'column', justifyContent: 'space-between' });

        const mainContent = gui.Container.create();
        mainContent.setStyle({ flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' });

        const attributedText = gui.AttributedText.create(text, {
            font: gui.Font.create('Arial', 16, "medium", "normal")
        });
        const title = gui.Label.createWithAttributedText(attributedText);
        title.setStyle({ margin: 10 });
        mainContent.addChildView(title);
        if (description) {
            const label = gui.Label.create(description);
            label.setStyle({ margin: 5 });
            mainContent.addChildView(label);
        }

        this.footer = gui.Container.create();
        this.footer.setStyle({ flexDirection: 'row', justifyContent: 'flex-end' });

        this.window.setContentView(body);
        body.addChildView(mainContent);
        body.addChildView(this.footer);
        this.window.onClose = () => {
            if (this.onCloseCb) {
                this.onCloseCb();
            }
        };
    }

    addButton(text: string, isDefault: boolean, onPress: () => void, isHighlighted?: boolean) {
        const button = gui.Button.create(text);
        button.setStyle({ margin: 5 });
        if (isDefault) {
            this.onCloseCb = onPress;
        }
        if (isHighlighted) {
            button.makeDefault();
        }
        button.onClick = () => {
            onPress();
            this.onCloseCb = null;
            this.close();
        };
        this.footer.addChildView(button);
    }

    close() {
        this.window.close();
    }

    show() {
        this.window.center();
        this.window.activate();
    }
}
