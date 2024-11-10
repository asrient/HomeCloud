import { PairingRequest } from "./agentKit/types";

export type NativeButtonConfig = {
    text: string;
    type?: "primary" | "default" | "danger";
    isDefault?: boolean;
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
            description: `Please verify the fingerprint before continuing.\nFingerprint: ${pairingReq.clientFinerprint}`,
            buttons: [{
                text: "Allow",
                onPress: () => {
                    ask = this.ask({
                        title: otp,
                        description: `Enter the OTP on the ${pairingReq.clientDeviceName} to complete pairing.`,
                        buttons: [{
                            text: "Done",
                            type: "primary",
                            isDefault: true,
                            onPress: () => {}
                        }, {
                            text: "Deny",
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
}

let native: NativeImpl | null = null;

export function setupNative(n: NativeImpl) {
  native = n;
}

export default native;
