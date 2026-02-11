import { ModulesType } from "shared/modules";
import { NativeUtils } from "./lib/types";

export declare global {
    interface Window {
        modules: ModulesType;
        utils: NativeUtils;
    }
}
