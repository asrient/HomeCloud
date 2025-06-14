import { AppConfigType } from "./types";
import ServiceController from "./services/controller";
import CryptoModule from "./crypto";
import ConfigStorage from "./storage";

export type ModulesType = {
    config: AppConfigType;
    ServiceController: typeof ServiceController;
    crypto: CryptoModule;
    ConfigStorage: typeof ConfigStorage;
}

export function setModules(mod: ModulesType) {
    global.modules = mod;
}
