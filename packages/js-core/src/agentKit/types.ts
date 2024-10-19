import { DeviceInfo, PairingAuthType } from "../envConfig";
import { ProfileDetails } from "../models";

export type AgentInfo = {
    deviceName: string;
    fingerprint: string;
    version: string;
    deviceInfo: DeviceInfo;
    pairingAuthType: PairingAuthType;
    profile?: ProfileDetails;
    availableProfiles: ProfileDetails[];
}
