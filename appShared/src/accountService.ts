import Signal from "./signals";
import { HttpClientCompat, WsClientCompat } from "./compat";
import { Service, serviceStartMethod, serviceStopMethod } from "./servicePrimatives";
import ConfigStorage from "./storage";
import { AccountLinkResponse, AccountLinkVerifyResponse, PeerConnectRequest, PeerInfo, StoreNames, WebcInit, WebcPeerData, WebcReject } from "./types";
import CustomError, { ErrorCode, ErrorType } from "./customError";

const USER_AGENT = "HomeCloud-AppClient/1.0";

export type AccountOpts = {
    httpClient: HttpClientCompat;
    webSocket: WsClientCompat;
};

enum WebSocketEvent {
    WEB_CONNECT_REQUEST = "webc_request",
    WEB_CONNECT_PEER_DATA = "webc_peer_data",
    WEB_CONNECT_REJECT = "webc_reject",
    PEER_ADDED = "peer_added",
    PEER_REMOVED = "peer_removed",
    PEER_ONLINE = "peer_online",
    AUTH_ERROR = "auth_error",
    PEER_CONNECT_REQUEST = "connect_request",
}

enum WebSocketAction {
    AUTH = "auth",
}

export class AccountService extends Service {
    private httpClient: HttpClientCompat;
    private webSocket: WsClientCompat;
    protected store: ConfigStorage;
    private autoRenewToken = true;
    private tokenRenewalPromise: Promise<string> | null = null;

    // incoming requests
    public webcInitSignal = new Signal<[WebcInit]>();
    public webcPeerDataSignal = new Signal<[WebcPeerData]>();
    public webcRejectSignal = new Signal<[WebcReject]>();

    public peerAddedSignal = new Signal<[PeerInfo]>();
    public peerRemovedSignal = new Signal<[PeerInfo]>();
    public peerOnlineSignal = new Signal<[string]>(); // fingerprint

    public accountLinkSignal = new Signal<[boolean]>();

    public websocketConnectionSignal = new Signal<[boolean]>();

    public peerConnectRequestSignal = new Signal<[PeerConnectRequest]>();

    private buildApiUrl(path: string, params?: Record<string, string | number>): URL {
        const baseUrl = modules.config.SERVER_URL;
        const url = new URL(path, baseUrl);
        if (params) {
            Object.keys(params).forEach((key) => {
                url.searchParams.append(key, params[key].toString());
            });
        }
        return url;
    }

    public isServerConnected(): boolean {
        return this.webSocket.isConnected();
    }

    public isLinked(): boolean {
        return !!this.store.getItem<boolean>("accountId");
    }

    public getAccountId(): string | null {
        return this.store.getItem<string>("accountId") || null;
    }

    public getAccountEmail(): string | null {
        return this.store.getItem<string>("email") || null;
    }

    public getValidToken(): string | null {
        if (!this.isLinked()) {
            return null;
        }
        const expiry = this.store.getItem<number>("tokenExpiry");
        if (!expiry) {
            return null;
        }
        if (Date.now() >= expiry) return null;
        return this.store.getItem<string>("authToken") || null;
    }

    private resetToken() {
        this.store.setItem("authToken", null);
        this.store.setItem("tokenExpiry", null);
    }

    private handleWebSocketEvent(event: WebSocketEvent, data: any) {
        console.log("Received WebSocket event:", event, data);
        switch (event) {
            case WebSocketEvent.WEB_CONNECT_REQUEST:
                this.webcInitSignal.dispatch(data as WebcInit);
                break;
            case WebSocketEvent.WEB_CONNECT_PEER_DATA:
                this.webcPeerDataSignal.dispatch(data as WebcPeerData);
                break;
            case WebSocketEvent.WEB_CONNECT_REJECT:
                this.webcRejectSignal.dispatch(data as WebcReject);
                break;
            case WebSocketEvent.PEER_ADDED:
                this.peerAddedSignal.dispatch(data as PeerInfo);
                break;
            case WebSocketEvent.PEER_REMOVED:
                this.peerRemovedSignal.dispatch(data as PeerInfo);
                break;
            case WebSocketEvent.PEER_ONLINE:
                console.log(`Peer online event received for fingerprint: ${data.fingerprint}`);
                this.peerOnlineSignal.dispatch(data.fingerprint as string);
                break;
            case WebSocketEvent.AUTH_ERROR:
                console.warn("WebSocket auth error received.");
                this.resetToken();
                this.webSocket.close();
                break;
            case WebSocketEvent.PEER_CONNECT_REQUEST:
                this.peerConnectRequestSignal.dispatch(data as PeerConnectRequest);
                break;
            default:
                console.warn(`Unknown WebSocket event: ${event}`);
        }
    }

    private async createdSignedPacket(data: Record<string, any>): Promise<{
        data: string;
        signature: string;
        publicKeyPem: string;
        expireAt: number;
        nonce: string;
    }> {
        const sign = await modules.crypto.sign(new TextEncoder().encode(JSON.stringify(data)), modules.config.PRIVATE_KEY_PEM);
        const signString = await modules.crypto.bufferToBase64(sign);
        const publicKeyPem = modules.config.PUBLIC_KEY_PEM;
        return {
            data: JSON.stringify(data),
            signature: signString,
            publicKeyPem,
            expireAt: Date.now() + 3 * 60 * 1000, // 3 minutes expiry,
            nonce: modules.crypto.uuid(),
        };
    }

    private async assertSuccess(resp: Response, type: 'string' | 'json' | null = null): Promise<void> {
        if (resp.ok) {
            if (!type) return;
            // validate content type
            const contentType = resp.headers.get("Content-Type") || "";
            if (type === 'string' && contentType.includes("text/plain")) {
                return;
            }
            if (type === 'json' && contentType.includes("application/json")) {
                return;
            }
            // unexpected content type
            throw new CustomError(ErrorType.Generic, `Unexpected response content type: ${contentType}`);
        }
        // check for content-type
        let err: CustomError;
        const contentType = resp.headers.get("Content-Type") || "";
        if (contentType.includes("application/json")) {
            const respData = await resp.json();
            err = CustomError.fromErrorResponse(respData);
        } else if (contentType.includes("text/plain")) {
            const errorMessage = await resp.text();
            err = new CustomError(ErrorType.Generic, errorMessage);
        } else {
            err = new CustomError(ErrorType.Generic, `Request failed with status ${resp.status}`);
        }
        console.error(`[API error] ${resp.url} (${resp.status})`);
        console.error(err);
        throw err;
    }

    public async initiateLink(email?: string, peerInfo?: PeerInfo): Promise<AccountLinkResponse> {
        if (!this.isLinked() && (!peerInfo || !email)) {
            throw new Error("Peer information and email are required for linking for first time.");
        }
        const packet = await this.createdSignedPacket({
            email: email || null,
            accountId: !email ? this.getAccountId() : null,
            fingerprint: modules.config.FINGERPRINT,
            peerInfo: peerInfo || null,
        });
        const response = await this.httpClient.post(this.buildApiUrl("/api/link"), JSON.stringify(packet), {
            "Content-Type": "application/json",
        });
        await this.assertSuccess(response, 'json');
        const respData = await response.json();
        return {
            requestId: respData.requestId,
            isEmailChange: respData.isEmailChange,
            requiresVerification: respData.requiresVerification,
        }
    }

    public async verifyLink(requestId: string, pin: string | null): Promise<AccountLinkVerifyResponse> {
        const resp = await this.httpClient.post(this.buildApiUrl("/api/link-verify"), JSON.stringify({
            requestId,
            pin,
        }), {
            "Content-Type": "application/json",
        });
        await this.assertSuccess(resp, 'json');
        const respData = await resp.json();
        this.store.setItem("accountId", respData.accountId);
        this.store.setItem("email", respData.email || null);
        this.store.setItem("authToken", respData.authToken);
        this.store.setItem("tokenExpiry", respData.tokenExpiry);
        await this.store.save();
        this.autoRenewToken = true; // Re-enable auto-renew after successful link
        if (!this.webSocket.isConnected()) {
            this.connectWebSocket();
        }
        this.accountLinkSignal.dispatch(true);
        return {
            accountId: respData.accountId,
            authToken: respData.authToken,
            tokenExpiry: respData.tokenExpiry,
            email: respData.email || null,
        };
    }

    private async getOrFetchToken() {
        let token = this.getValidToken();
        if (token) return token;

        if (!this.autoRenewToken || !this.isLinked()) {
            throw new Error("No valid auth token available.");
        }

        // If a renewal is already in progress, wait for it
        if (this.tokenRenewalPromise) {
            return this.tokenRenewalPromise;
        }

        this.tokenRenewalPromise = this.renewToken();
        try {
            token = await this.tokenRenewalPromise;
            return token;
        } finally {
            this.tokenRenewalPromise = null;
        }
    }

    private async renewToken(): Promise<string> {
        console.log("Fetching new auth token...");
        try {
            const { requestId, requiresVerification } = await this.initiateLink();
            if (requiresVerification) {
                this.autoRenewToken = false;
                throw new Error("Account requires verification to renew token.");
            }
            const linkResp = await this.verifyLink(requestId, null);
            console.log("Fetched new auth token.");
            return linkResp.authToken;
        } catch (err) {
            // If account no longer exists on server, reset local account data
            // For backwards compatibility, we are considering validation error on accountId as well.
            console.log("Failed to fetch new auth token:", err);
            if (err instanceof CustomError && (
                err.data?.code === ErrorCode.ACCOUNT_NOT_FOUND
                || (err.type === ErrorType.Validation && !!err.data?.fields?.accountId)
            )) {
                console.warn("Account not found on server. Resetting local account data.");
                await this.resetAccountData();
            }
            throw err;
        }
    }

    private async postWithAuth(url: string, body?: any, _isRetry = false): Promise<Response> {
        const token = await this.getOrFetchToken();
        const bodyType = body instanceof Uint8Array ? "application/octet-stream" : "application/json";
        const sendBody = bodyType === "application/json" ? JSON.stringify(body) : body;
        const headers = {
            "Token": token,
            "Content-Type": bodyType,
        };
        const resp = await this.httpClient.post(this.buildApiUrl(url), sendBody, headers);
        if (resp.status === 401 && !_isRetry) {
            this.resetToken();
            return this.postWithAuth(url, body, true);
        }
        return resp;
    }

    private async getWithAuth(url: string, params?: Record<string, string | number>, _isRetry = false): Promise<Response> {
        const token = await this.getOrFetchToken();
        const headers = {
            "Token": token,
        };
        const resp = await this.httpClient.get(this.buildApiUrl(url, params), headers);
        if (resp.status === 401 && !_isRetry) {
            this.resetToken();
            return this.getWithAuth(url, params, true);
        }
        return resp;
    }

    public async getPeerList(): Promise<PeerInfo[]> {
        const resp = await this.getWithAuth("/api/peer");
        await this.assertSuccess(resp, 'json');
        const respData = await resp.json();
        return respData as PeerInfo[];
    }

    public async isPeerOnline(fingerprint: string): Promise<boolean> {
        const resp = await this.getWithAuth("/api/peer/online", { fingerprint });
        await this.assertSuccess(resp, 'json');
        const respData = await resp.json();
        return respData.isOnline as boolean;
    }

    public async requestPeerConnect(fingerprint: string, addresses: string[], port: number): Promise<void> {
        const resp = await this.postWithAuth("/api/peer/hello", {
            fingerprint,
            addresses,
            port,
        });
        await this.assertSuccess(resp);
    }

    public async updatePeerInfo(peerInfo: PeerInfo): Promise<void> {
        const resp = await this.postWithAuth("/api/peer/update", peerInfo);
        await this.assertSuccess(resp);
    }

    public async removePeer(fingerprint: string | null): Promise<void> {
        try {
            const resp = await this.postWithAuth("/api/peer/remove", { fingerprint });
            await this.assertSuccess(resp);
        } catch (err) {
            throw err;
        } finally {
            // Regardless of success or failure, if we its a removal of self, reset account data
            // This helps when server is having issues and we still want the user to remove account link locally
            if (fingerprint === null) {
                console.log("Removed self from account; resetting account data.");
                await this.resetAccountData();
            }
        }
    }

    public async requestWebcInit(fingerprint: string): Promise<WebcInit> {
        const resp = await this.postWithAuth("/api/webc/init", {
            fingerprint,
        });
        await this.assertSuccess(resp, 'json');
        return resp.json();
    }

    public async requestWebcLocal(pin: string, addresses: string[], port: number): Promise<void> {
        const resp = await this.postWithAuth("/api/webc/local", {
            pin,
            addresses,
            port,
        });
        await this.assertSuccess(resp);
    }

    public async init(opts: AccountOpts) {
        this._init();
        this.httpClient = opts.httpClient;
        this.httpClient.setDefaultHeader("User-Agent", USER_AGENT);
        this.webSocket = opts.webSocket;
        this.store = modules.ConfigStorage.getInstance(StoreNames.ACCOUNT);
        await this.store.load();
        this.webSocket.onmessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleWebSocketEvent(msg.type as WebSocketEvent, msg.data);
            } catch (err) {
                console.error("Failed to handle WebSocket message:", err);
            }
        };
        this.webSocket.onclose = async (event: CloseEvent) => {
            console.warn(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
            await this.handleWebsocketClose();
        }
        this.webSocket.onerror = (event: ErrorEvent) => {
            this.handleWebsocketError(new Error(`WebSocket error occurred: ${event.message || event.error || 'unknown error'}`));
        };
        this.webSocket.onopen = async (event: Event) => {
            await this.handleWebsocketConnected();
        };
    }

    public async connectWebSocket() {
        if (!this.isServiceRunning()) return;
        if (!this.isLinked()) {
            console.warn("Account is not linked; skipping WebSocket connection.");
            return;
        }
        if (this.webSocket.isConnected()) {
            console.log("WebSocket is already connected.");
            return;
        }
        let token: string | null;
        try {
            token = await this.getOrFetchToken();
        } catch (err) {
            console.warn("Failed to get token for WebSocket:", err);
            return;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        try {
            this.webSocket.connect(modules.config.WS_SERVER_URL, `tok-${token}`);
        } catch (err) {
            console.error("Failed to connect WebSocket:", err);
        }
    };

    private retryTimer: number | null = null;
    private retryDelay = 40 * 1000; // 40 seconds
    private pingInterval: number | null = null;
    private readonly PING_INTERVAL = 90 * 1000; // 90 seconds (1.5 mins)

    /**
     * Stop the WebSocket connection. Clears any pending retry timers,
     */
    public stopWebSocket() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        if (this.webSocket.isConnected()) {
            this.webSocket.close();
        }
    };

    private retryConnect = () => {
        if (!this.isServiceRunning()) return;
        if (this.retryTimer) {
            return;
        }
        this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60 * 1000); // Exponential backoff up to 5 minutes
        this.retryTimer = setTimeout(() => this.connectWebSocket(), this.retryDelay);
    };

    private isActive = false;

    private handleWebsocketClose = async () => {
        if (!this.isServiceRunning()) return;
        this.stopPingInterval();
        if (this.isActive) {
            this.websocketConnectionSignal.dispatch(false);
            this.isActive = false;
        }
        this.retryConnect();
    };

    private handleWebsocketError = (error: Error) => {
        console.error("WebSocket error:", error);
        if (this.webSocket.isConnected()) {
            this.webSocket.close();
        } else {
            this.handleWebsocketClose();
        }
    };

    private handleWebsocketConnected = async () => {
        console.log("WebSocket connected.");
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryDelay = 1000; // Reset delay
        // Start ping interval
        this.startPingInterval();
        // Send initial auth token
        this.isActive = true;
        this.websocketConnectionSignal.dispatch(true);
    };

    private startPingInterval() {
        this.stopPingInterval();
        // Send initial ping
        this.sendPing();
        // Set up interval for subsequent pings
        this.pingInterval = setInterval(() => {
            this.sendPing();
        }, this.PING_INTERVAL);
    }

    private stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    private sendPing() {
        if (this.webSocket.isConnected()) {
            try {
                this.webSocket.send(JSON.stringify({ type: "ping" }));
            } catch (err) {
                console.error("Failed to send ping:", err);
            }
        }
    }

    private async resetAccountData() {
        this.accountLinkSignal.dispatch(false);
        this.store.clear();
        await this.store.save();
        this.webSocket.isConnected() && this.webSocket.close();
    }

    @serviceStartMethod
    public async start() {
        this.connectWebSocket();
    }

    @serviceStopMethod
    public async stop() {
        this.webSocket.close();
    }
}
