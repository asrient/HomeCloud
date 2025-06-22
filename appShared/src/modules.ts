import { AppConfigType } from "./types";
import ServiceController from "./services/controller";
import CryptoModule from "./crypto";
import ConfigStorage from "./storage";

export type ModulesType = {
    config: AppConfigType;
    ServiceController: typeof ServiceController;
    crypto: CryptoModule;
    ConfigStorage: typeof ConfigStorage;
    getLocalServiceController: () => ServiceController;
    getRemoteServiceController: (fingerprint: string) => Promise<ServiceController>;
}

export function setModules(mod: ModulesType, globalObject: any) {
    globalObject.modules = mod;
}
