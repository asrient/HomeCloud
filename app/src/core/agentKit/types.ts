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
    iconKey: string | null;
}

export type BonjourTxt = {
    version: string;
    iconKey: string;
    deviceName: string;
    fingerprint: string;
}

export type AgentCandidate = {
    fingerprint?: string;
    deviceName?: string;
    iconKey?: string;
    host: string;
}

export type PairingRequest = {
    clientProfileId: number;
    clientDeviceName: string;
    clientFinerprint: string;
    clientprofileName: string;
    targetProfileId: number;
    targetFingerprint: string;
    expireAt: number;
}
