import { ModulesType } from "shared/modules";
import MobileServiceController from "@/lib/serviceController";
import { MobileConfigType } from "@/lib/types";

export type MobileModulesType = ModulesType & {
    config: MobileConfigType;
    ServiceController: typeof MobileServiceController;
    getLocalServiceController: () => MobileServiceController;
    getRemoteServiceController: (fingerprint: string) => Promise<MobileServiceController>;
}

declare global {
    var modules: MobileModulesType;
}
