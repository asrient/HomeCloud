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
    "webc_reject",
    "peer_added",
    "peer_removed",
    "peer_online",
    "auth_error",
    "connect_request",
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
    deviceName: z.string().min(1).max(255),
    fingerprint: z.string().min(6),
    version: z.string().min(1).max(64),
    deviceInfo: DeviceInfoSchema,
    iconKey: z.string().nullable(),
}).strict();

// AccountLinkSignedPayload schema
export const AccountLinkSignedPayloadSchema = z.object({
    email: z.email().nullable(),
    accountId: z.string().nullable(),
    fingerprint: z.string().min(6),
    peerInfo: PeerInfoSchema.nullable(),
}).strict();

// AccountLinkRequest schema
export const AccountLinkRequestSchema = z.object({
    data: z.string(),
    signature: z.string(),
    publicKeyPem: z.string(),
    expireAt: z.number().min(0),
    nonce: z.string().min(16).max(64),
}).strict();

// AccountLinkVerifyRequest schema
export const AccountLinkVerifyRequestSchema = z.object({
    requestId: z.string(),
    pin: z.string().nullable(),
}).strict();

// Webc init request schema
export const WebcInitRequestSchema = z.object({
    fingerprint: z.string(),
}).strict();

// Peer fingerprint schema
export const PeerFingerprintOptionalSchema = z.object({
    fingerprint: z.string().nullable(),
}).strict();

// Peer fingerprint required schema
export const PeerFingerprintSchema = z.object({
    fingerprint: z.string(),
}).strict();

// Peer connect request schema (used for both API request and WebSocket event payload)
export const PeerConnectRequestSchema = z.object({
    fingerprint: z.string(),
    addresses: z.array(z.string()),
    port: z.number(),
}).strict();

// Webc local peer data schema (request for local relay)
export const WebcLocalPeerDataSchema = z.object({
    pin: z.string(),
    addresses: z.array(z.string()).min(1),
    port: z.number().min(1).max(65535),
}).strict();

// WebcInit schema
export const WebcInitSchema = z.object({
    fingerprint: z.string(),
    pin: z.string(),
    serverAddress: z.string().optional(),
    serverPort: z.number().min(1).max(65535).optional(),
}).strict();

// WebcPeerData schema
export const WebcPeerDataSchema = z.object({
    pin: z.string(),
    peerAddress: z.string(),
    peerPort: z.number().min(1).max(65535),
}).strict();

// Webc Reject schema
export const WebcRejectSchema = z.object({
    pin: z.string(),
    message: z.string(),
}).strict();

// Event Schema
export const EventSchema = z.object({
    type: WebSocketEventSchema,
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
