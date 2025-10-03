import { AppConfigType } from "shared/types";

export enum MobilePlatform {
    ANDROID = "android",
    IOS = "ios",
}

export enum UITheme {
    Win11 = "win11",
    Macos = "macos",
    Android = "android",
    Ios = "ios",
}

export type MobileConfigType = AppConfigType & {
    PLATFORM: MobilePlatform;
}
