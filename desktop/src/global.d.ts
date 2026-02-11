import { ModulesType } from "shared/modules";
import { DesktopConfigType } from "./types";
import DesktopServiceController from "./services/desktopServiceController";

export type DesktopModulesType = ModulesType & {
    config: DesktopConfigType;
    ServiceController: typeof DesktopServiceController;
    getLocalServiceController: () => DesktopServiceController;
    getRemoteServiceController: (fingerprint: string) => Promise<DesktopServiceController>;
}

declare global {
    var modules: DesktopModulesType;
}
