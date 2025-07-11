import { AppConfigType } from "shared/types";

export enum MobilePlatform {
    ANDROID = "android",
    IOS = "ios",
}

export type MobileConfigType = AppConfigType & {
    PLATFORM: MobilePlatform;
}
