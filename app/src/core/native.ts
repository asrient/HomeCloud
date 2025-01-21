import { PairingRequest } from "./agentKit/types";
import { deviceIdFromFingerprint } from "./utils";

export type NativeButtonConfig = {
    text: string;
    type?: "primary" | "default" | "danger";
    isDefault?: boolean;
    isHighlighted?: boolean;
    onPress: () => void;
}

export type NativeAskConfig = {
    title: string;
    description?: string;
    buttons: NativeButtonConfig[];
}

export type NativeAsk = {
    close: () => void;
}

export abstract class NativeImpl {
    abstract crashApp(msg: string): void;
    abstract quitApp(): void;
    abstract open(url: string): Promise<void>;
    abstract ask(config: NativeAskConfig): NativeAsk;

    _alerts: NativeAsk[] = [];

    alert(title: string, description?: string) {
        const ask = this.ask({
            title,
            description: description,
            buttons: [{
                text: "Okay",
                isDefault: true,
                isHighlighted: true,
                onPress: () => {
                    this._alerts = this._alerts.filter(a => a !== ask);
                }
            }]
        });
        this._alerts.push(ask);
    }

    otpFlow(pairingReq: PairingRequest, otp: string, onDeny: () => void): NativeAsk {
        let ask = this.ask({
            title: `Allow "${pairingReq.clientDeviceName}" to connect?`,
            description: `Please verify the fingerprint before continuing: ${deviceIdFromFingerprint(pairingReq.clientFinerprint)}`,
            buttons: [{
                text: "Allow",
                isHighlighted: true,
                onPress: () => {
                    ask = this.ask({
                        title: otp,
                        description: `Enter the Code on "${pairingReq.clientDeviceName}" to complete pairing.`,
                        buttons: [{
                            text: "Done",
                            type: "primary",
                            isHighlighted: true,
                            isDefault: true,
                            onPress: () => { }
                        }, {
                            text: "Cancel",
                            onPress: onDeny
                        }]
                    });
                }
            }, {
                text: "Deny",
                isDefault: true,
                onPress: onDeny
            }]
        });
        return {
            close: () => ask.close()
        }
    }

    importModule(moduleName: string) {
        return require(`../../build/Release/${moduleName}.node`);
    }
}

export let native: NativeImpl | null = null;

export function setupNative(n: NativeImpl) {
    console.log("🔌 Setting up native module..");
    native = n;
}
