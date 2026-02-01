import { z } from 'zod';
import {
    OSTypeSchema,
    DeviceFormTypeSchema,
    DeviceInfoSchema,
    PeerInfoSchema,
    AccountLinkSignedPayloadSchema,
    WebcInitSchema,
    WebcPeerDataSchema,
    WebcRejectSchema,
    EventSchema,
    HelloSchema,
    WebSocketEventSchema,
    WebSocketActionSchema,
    TokenSchema,
    AccountLinkRequestSchema,
    AccountLinkVerifyRequestSchema,
    WebcInitRequestSchema,
    PeerFingerprintOptionalSchema,
    PeerFingerprintSchema,
    WebcLocalPeerDataSchema,
    PeerConnectRequestSchema,
} from './schema';
import { ObjectId } from 'mongodb';

// Inferred types from schemas
export type OSType = z.infer<typeof OSTypeSchema>;
export type DeviceFormType = z.infer<typeof DeviceFormTypeSchema>;
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
export type PeerInfo = z.infer<typeof PeerInfoSchema>;
export type AccountLinkSignedPayload = z.infer<typeof AccountLinkSignedPayloadSchema>;
export type WebcInit = z.infer<typeof WebcInitSchema>;
export type WebcPeerData = z.infer<typeof WebcPeerDataSchema>;
export type WebcReject = z.infer<typeof WebcRejectSchema>;
export type EventType = z.infer<typeof EventSchema>;
export type HelloType = z.infer<typeof HelloSchema>;
export type WebSocketEvent = z.infer<typeof WebSocketEventSchema>;
export type WebSocketAction = z.infer<typeof WebSocketActionSchema>;
export type TokenType = z.infer<typeof TokenSchema>;
export type AccountLinkRequest = z.infer<typeof AccountLinkRequestSchema>;
export type AccountLinkVerifyRequest = z.infer<typeof AccountLinkVerifyRequestSchema>;
export type WebcInitRequest = z.infer<typeof WebcInitRequestSchema>;
export type PeerFingerprintOptional = z.infer<typeof PeerFingerprintOptionalSchema>;
export type PeerFingerprint = z.infer<typeof PeerFingerprintSchema>;
export type WebcLocalPeerData = z.infer<typeof WebcLocalPeerDataSchema>;
export type PeerConnectRequest = z.infer<typeof PeerConnectRequestSchema>;

/* Database Types */

export interface Account {
    _id: ObjectId;
    email: string;
    isAdmin?: boolean;
    createdAt: number;
    updatedAt?: number;
}

export type AccountCreate = Omit<Account, '_id'>;

export interface Peer extends PeerInfo {
    _id: ObjectId;
    accountId: ObjectId;
    createdAt: number;
}

export type PeerCreate = Omit<Peer, '_id'>;

/* API Response types */

export type AccountLinkResponse = {
    requestId: string;
    isEmailChange: boolean;
    requiresVerification: boolean;
}

export type AccountLinkVerifyResponse = {
    authToken: string;
    tokenExpiry: number;
    email: string | null;
    accountId: string;
}
