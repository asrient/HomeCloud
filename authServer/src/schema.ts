import * as z from "zod";

// Enum schemas
export const OSTypeSchema = z.enum([
    "windows",
    "macos", 
    "linux",
    "android",
    "ios",
    "unknown"
]);

export const DeviceFormTypeSchema = z.enum([
    "desktop",
    "laptop",
    "mobile", 
    "tablet",
    "unknown",
    "server"
]);

export const WebSocketEventSchema = z.enum([
    "webc_request",
    "webc_peer_data",
    "peer_added",
    "peer_removed",
    "auth_error",
]);

export const WebSocketActionSchema = z.enum([
    "auth",
]);

// DeviceInfo schema
export const DeviceInfoSchema = z.object({
    os: OSTypeSchema,
    osFlavour: z.string().nullable(),
    formFactor: DeviceFormTypeSchema,
}).strict();

// PeerInfo schema
export const PeerInfoSchema = z.object({
    deviceName: z.string(),
    fingerprint: z.string(),
    version: z.string(),
    deviceInfo: DeviceInfoSchema,
    iconKey: z.string().nullable(),
}).strict();

// AccountLinkSignedPayload schema
export const AccountLinkSignedPayloadSchema = z.object({
    email: z.string().nullable(),
    accountId: z.string().nullable(),
    fingerprint: z.string(),
    peerInfo: PeerInfoSchema.nullable(),
}).strict();

// AccountLinkRequest schema
export const AccountLinkRequestSchema = z.object({
    data: z.string(),
    signature: z.string(),
    publicKeyPem: z.string(),
    expireAt: z.number(),
    nonce: z.string(),
}).strict();

// AccountLinkVerifyRequest schema
export const AccountLinkVerifyRequestSchema = z.object({
    requestId: z.string(),
    pin: z.string().nullable(),
}).strict();

// Peer fingerprint schema
export const PeerFingerprintSchema = z.object({
    fingerprint: z.string(),
}).strict();

// WebcInit schema
export const WebcInitSchema = z.object({
    fingerprint: z.string(),
    pin: z.string(),
    serverAddress: z.string().optional(),
    serverPort: z.number().optional(),
}).strict();

// WebcPeerData schema
export const WebcPeerDataSchema = z.object({
    pin: z.string(),
    peerAddress: z.string(),
    peerPort: z.number(),
}).strict();

// Event Schema
export const EventSchema = z.object({
    type: z.string(),
    data: z.any(),
}).strict();

// Hello Schema
export const HelloSchema = z.object({
    message: z.string(),
}).strict();

// Token Schema
export const TokenSchema = z.object({
    accountId: z.string(),
    peerId: z.string(),
});
