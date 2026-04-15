import { ModulesType } from "shared/modules";
import { AppConfigType } from "shared/types";

export type ServerConfigType = AppConfigType & {
    ACCOUNT_ID: string;
}

export type ServerModulesType = ModulesType & {
    config: ServerConfigType;
}
