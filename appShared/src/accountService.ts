import Signal from "./signals";
import { HttpClientCompat, WsClientCompat } from "./compat";
import { Service, serviceStartMethod, serviceStopMethod } from "./servicePrimatives";
import ConfigStorage from "./storage";
import { AccountLinkResponse, AccountLinkVerifyResponse, PeerInfo, StoreNames, WebcInit, WebcPeerData } from "./types";
import CustomError, { ErrorType } from "./customError";

const USER_AGENT = "MediaCenter-AppClient/1.0";

export type AccountOpts = {
    httpClient: HttpClientCompat;
    webSocket: WsClientCompat;
};

enum WebSocketEvent {
    WEB_CONNECT_REQUEST = "webc_request",
    WEB_CONNECT_PEER_DATA = "webc_peer_data",
    PEER_ADDED = "peer_added",
    PEER_REMOVED = "peer_removed",
    AUTH_ERROR = "auth_error",
}

enum WebSocketAction {
    AUTH = "auth",
}

export class AccountService extends Service {
    private httpClient: HttpClientCompat;
    private webSocket: WsClientCompat;
    protected store: ConfigStorage;
    private autoRenewToken = true;

    // incoming requests
    public webcInitSignal = new Signal<[WebcInit]>();
    public webcPeerDataSignal = new Signal<[WebcPeerData]>();

    public peerAddedSignal = new Signal<[PeerInfo]>();
    public peerRemovedSignal = new Signal<[PeerInfo]>();

    public accountLinkedSignal = new Signal<[]>();
    public accountUnlinkedSignal = new Signal<[]>();

    public websocketConnectedSignal = new Signal<[]>();
    public websocketDisconnectedSignal = new Signal<[]>();

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
        switch (event) {
            case WebSocketEvent.WEB_CONNECT_REQUEST:
                this.webcInitSignal.dispatch(data as WebcInit);
                break;
            case WebSocketEvent.WEB_CONNECT_PEER_DATA:
                this.webcPeerDataSignal.dispatch(data as WebcPeerData);
                break;
            case WebSocketEvent.PEER_ADDED:
                this.peerAddedSignal.dispatch(data as PeerInfo);
                break;
            case WebSocketEvent.PEER_REMOVED:
                this.peerRemovedSignal.dispatch(data as PeerInfo);
                break;
            case WebSocketEvent.AUTH_ERROR:
                console.warn("WebSocket auth error received.");
                this.resetToken();
                this.webSocket.close();
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

    private async assertSuccess(resp: Response, type: 'string' | 'json' | null = null ): Promise<void> {
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
        if (!this.webSocket.isConnected()) {
            this.connectWebSocket();
        }
        this.accountLinkedSignal.dispatch();
        return {
            accountId: respData.accountId,
            authToken: respData.authToken,
            tokenExpiry: respData.tokenExpiry,
            email: respData.email || null,
        };
    }

    private async getOrFetchToken() {
        let token = this.getValidToken();
        if (!token && this.autoRenewToken && this.isLinked()) {
            console.log("Fetching new auth token...");
            const { requestId, requiresVerification } = await this.initiateLink();
            if (requiresVerification) {
                this.autoRenewToken = false;
                throw new Error("Account requires verification to renew token.");
            }
            const linkResp = await this.verifyLink(requestId, null);
            token = linkResp.authToken;
            console.log("Fetched new auth token.");
        }
        if (!token) {
            throw new Error("No valid auth token available.");
        }
        return token;
    }

    private async postWithAuth(url: string, body?: any) {
        const token = await this.getOrFetchToken();
        const bodyType = body instanceof Uint8Array ? "application/octet-stream" : "application/json";
        if (bodyType === "application/json") {
            body = JSON.stringify(body);
        }
        const headers = {
            "Token": token,
            "Content-Type": bodyType,
        };
        return this.httpClient.post(this.buildApiUrl(url), body, headers);
    }

    private async getWithAuth(url: string, params?: Record<string, string | number>) {
        const token = await this.getOrFetchToken();
        const headers = {
            "Token": token,
        };
        return this.httpClient.get(this.buildApiUrl(url, params), headers);
    }

    public async getPeerList(): Promise<PeerInfo[]> {
        const resp = await this.getWithAuth("/api/peer");
        await this.assertSuccess(resp, 'json');
        const respData = await resp.json();
        return respData as PeerInfo[];
    }

    public async updatePeerInfo(peerInfo: PeerInfo): Promise<void> {
        const resp = await this.postWithAuth("/api/peer/update", peerInfo);
        await this.assertSuccess(resp);
    }

    public async removePeer(fingerprint: string | null): Promise<void> {
        const resp = await this.postWithAuth("/api/peer/remove", { fingerprint });
        await this.assertSuccess(resp);
        if (fingerprint === null) {
            console.log("Removed self from account; resetting account data.");
            await this.resetAccountData();
        }
    }

    public async requestWebcInit(fingerprint: string): Promise<WebcInit> {
        const resp = await this.postWithAuth("/api/webc/init", {
            fingerprint,
        });
        await this.assertSuccess(resp, 'json');
        return resp.json();
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

    public connectWebSocket = () => {
        if (!this.isServiceRunning()) return;
        if (!this.isLinked()) {
            console.warn("Account is not linked; skipping WebSocket connection.");
            return;
        }
        if (this.webSocket.isConnected()) {
            console.log("WebSocket is already connected.");
            return;
        }
        if (!this.getValidToken() && !this.autoRenewToken) {
            console.warn("No valid token available and auto-renew is disabled; skipping WebSocket connection.");
            return;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        try {
            this.webSocket.connect(modules.config.WS_SERVER_URL, `tok-${this.getValidToken()}`);
        } catch (err) {
            console.error("Failed to connect WebSocket:", err);
        }
    };

    private retryTimer: number | null = null;
    private retryDelay = 40 * 1000; // 40 seconds

    private retryConnect = () => {
        if (!this.isServiceRunning()) return;
        if (this.retryTimer) {
            return;
        }
        this.retryDelay = Math.min(this.retryDelay * 2, 5 * 60 * 1000); // Exponential backoff up to 5 minutes
        this.retryTimer = setTimeout(this.connectWebSocket, this.retryDelay);
    };

    private isActive = false;

    private handleWebsocketClose = async () => {
        if (!this.isServiceRunning()) return;
        if (this.isActive) {
            this.websocketDisconnectedSignal.dispatch();
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
        // Send initial auth token
        this.isActive = true;
        this.websocketConnectedSignal.dispatch();
    };

    private async resetAccountData() {
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
