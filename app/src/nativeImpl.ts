import { NativeImpl, NativeAskConfig, NativeAsk } from "./core/native";
import { crash } from "./crashHandler";
import Ask from "./views/ask";
import { openApp } from "./utils";

export default class NativeImplDesktop extends NativeImpl {
    private _quitHandler: (() => void);
    constructor(quitHandler: () => void) {
        super();
        this._quitHandler = quitHandler;
    }
    quitApp() {
        this._quitHandler();
    }
    crashApp(msg: string): void {
        crash(msg);
    }
    async open(url: string) {
        await openApp(url);
    }
    ask(config: NativeAskConfig): NativeAsk {
        const ask = new Ask(config.title, config.description);
        config.buttons.forEach((button) => {
            ask.addButton(button.text, button.isDefault, button.onPress);
        });
        ask.show();
        return {
            close: () => ask.close()
        };
    }
}
