import { DeviceInfo, PairingAuthType } from "../envConfig";

export type AgentInfo = {
    deviceName: string;
    fingerprint: string;
    version: string;
    deviceInfo: DeviceInfo;
    pairingAuthType: PairingAuthType;
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
    clientDeviceName: string;
    clientFinerprint: string;
    targetFingerprint: string;
    expireAt: number;
}
