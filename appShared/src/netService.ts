import { Service, serviceStartMethod, serviceStopMethod, RPCController, getMethodInfo, assertServiceRunning, RPCControllerProxy } from "./servicePrimatives";
import { GenericDataChannel, PeerCandidate, ConnectionType, MethodContext, ConnectionInfo, SignalEvent, CON_IFACE_PREF_KEY } from "./types";
import { RPCPeer } from "./rpc";
import Signal, { SignalNodeRef } from "./signals";
import { filterValidBonjourIps, sleep, fp } from "./utils";

let rpcCounter = 0;

type ConnectionRecord = {
    type: ConnectionType;
    rpc: RPCPeer;
    controllerProxy: RPCControllerProxy;
    signalSubs: Map<string, SignalNodeRef<any, any>>;
    rpcId: string;
};

export abstract class ConnectionInterface {
    abstract onIncomingConnection(callback: (dataChannel: GenericDataChannel, fingerprint?: string) => void): void;
    abstract connect(candidate: PeerCandidate): Promise<GenericDataChannel>;
    abstract getCandidates(fingerprint?: string): Promise<PeerCandidate[]>;
    abstract onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void;

    isSecure: boolean;

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;

    abstract isActive(): boolean;

    getServicePort(): number | null {
        return null;
    }

    getServiceAddresses(): string[] {
        return [];
    }
}

class ServiceControllerProxyFactory {
    private instances: Map<string, RPCControllerProxy> = new Map();

    get(fingerprint: string) {
        return this.instances.get(fingerprint);
    }

    getOrCreate(fingerprint: string): RPCControllerProxy {
        let proxy = this.get(fingerprint);
        if (proxy) {
            return proxy;
        }
        const localSc = modules.ServiceController.getLocalInstance();
        proxy = new RPCControllerProxy(localSc);
        this.instances.set(fingerprint, proxy);
        return proxy;
    }
}

export class NetService extends Service {

    private serviceControllerProxyFactory = new ServiceControllerProxyFactory();

    private connections: Map<string, ConnectionRecord> = new Map();

    private standbyConnections: Map<string, ConnectionRecord[]> = new Map();

    public connectionSignal = new Signal<[SignalEvent, ConnectionInfo]>();

    private connectionLock: Map<string, Signal<[RPCController | Error]>> = new Map();

    private availableCandidates: Map<string, PeerCandidate[]> = new Map();

    private connectionInterfaces: Map<ConnectionType, ConnectionInterface>;

    private autoConnectFingerprints: Map<string, Set<string>> = new Map();
    private autoConnectCooldowns: Map<string, number> = new Map();
    private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private static AUTO_CONNECT_COOLDOWN_MS = 2000;

    public addAutoConnectFingerprint(fingerprint: string, key?: string) {
        if (!this.autoConnectFingerprints.has(fingerprint)) {
            this.autoConnectFingerprints.set(fingerprint, new Set());
        }
        const keys = this.autoConnectFingerprints.get(fingerprint);
        if (key) {
            keys?.add(key);
        } else {
            keys?.add("__default");
        }
    }

    public removeAutoConnectFingerprint(fingerprint: string, key?: string) {
        if (this.autoConnectFingerprints.has(fingerprint)) {
            if (key) {
                const keys = this.autoConnectFingerprints.get(fingerprint);
                keys?.delete(key);
                if (keys && keys.size === 0) {
                    this.autoConnectFingerprints.delete(fingerprint);
                }
            } else {
                this.autoConnectFingerprints.delete(fingerprint);
            }
        }
    }

    public init(connectionInterfaces: Map<ConnectionType, ConnectionInterface>) {
        this._init();
        this.connectionInterfaces = connectionInterfaces;
        this.connectionInterfaces.forEach((connectionInterface, type) => {
            connectionInterface.onIncomingConnection((dataChannel, fingerprint) => {
                this.setupConnection(type, fingerprint || null, dataChannel).catch((error) => {
                    console.error(`[NetService] Error setting up incoming connection on ${type}:`, error);
                });
            });
            connectionInterface.onCandidateAvailable((candidate) => {
                this.handleCandidateAvailable(type, candidate);
            });
        });
    }

    private addAvailableCandidate(fingerprint: string, candidate: PeerCandidate) {
        candidate.expiry = candidate.expiry || Date.now() + 5 * 60 * 1000; // 5 minutes expiry
        if (!this.availableCandidates.has(fingerprint)) {
            this.availableCandidates.set(fingerprint, []);
        }
        const candidates = this.availableCandidates.get(fingerprint);
        // Check if candidate already exists
        candidates?.push(candidate);
    }

    private getAvailableCandidates(fingerprint: string): PeerCandidate[] {
        const now = Date.now();
        const candidates = this.availableCandidates.get(fingerprint) || [];
        // Filter out expired candidates
        const validCandidates = candidates.filter(c => c.expiry && c.expiry > now);
        this.availableCandidates.set(fingerprint, validCandidates);
        return validCandidates;
    }

    private removeAvailableCandidate(fingerprint: string, candidate?: PeerCandidate) {
        const candidates = this.availableCandidates.get(fingerprint);
        if (candidates) {
            if (!candidate) {
                this.availableCandidates.delete(fingerprint);
                return;
            }
            const index = candidates.findIndex(c => c === candidate);
            if (index !== -1) {
                candidates.splice(index, 1);
            }
        }
    }

    private async handleCandidateAvailable(type: ConnectionType, candidate: PeerCandidate) {
        const fingerprint = candidate.fingerprint;
        // add to available candidates
        this.addAvailableCandidate(fingerprint, candidate);

        // Check if auto-connect is needed
        if (fingerprint && this.autoConnectFingerprints.has(fingerprint)) {
            // Check cooldown to avoid duplicate connection storms
            const lastAttempt = this.autoConnectCooldowns.get(fingerprint);
            const now = Date.now();
            if (lastAttempt && (now - lastAttempt) < NetService.AUTO_CONNECT_COOLDOWN_MS) {
                console.debug(`[NetService] Auto-connect to ${fp(fingerprint)} on ${type} skipped due to cooldown.`);
                return;
            }
            this.autoConnectCooldowns.set(fingerprint, now);
            // Check if there is already a connection in progress
            if (this.connectionLock.has(fingerprint)) {
                // Wait for existing connection to complete, and then check if failed, if so, try again with this candidate
                const existingSignal = this.connectionLock.get(fingerprint);
                const result = await new Promise<RPCController | Error>((resolve) => {
                    const binding = existingSignal.add((data: RPCController | Error) => {
                        existingSignal.detach(binding);
                        resolve(data);
                    });
                });
                if (result instanceof RPCController) {
                    console.debug(`[NetService] Connection to ${fp(fingerprint)} already established, skipping auto-connect.`);
                    return;
                }
            }
            // Acquire the lock
            const newSignal = this.setupConnectionLock(fingerprint);
            try {
                console.log(`[NetService] Auto-connecting to candidate ${fp(fingerprint)} on ${type}`);
                const connectionInterface = this.connectionInterfaces.get(type);
                if (connectionInterface && connectionInterface.isActive()) {
                    const dataChannel = await connectionInterface.connect(candidate);
                    // Check lock still exists
                    if (!this.connectionLock.has(fingerprint)) {
                        console.debug(`[NetService] Connection lock released for ${fp(fingerprint)} while auto-connecting on ${type}, aborting.`);
                        dataChannel.disconnect();
                        return;
                    }
                    await this.setupConnection(type, fingerprint, dataChannel);
                }
            } catch (error) {
                console.error(`[NetService] Error auto-connecting to candidate ${fp(fingerprint)} on ${type}:`, error);
                if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === newSignal) {
                    newSignal.dispatch(error);
                    this.connectionLock.delete(fingerprint);
                }
            }
        }
    }

    public getConnectionInfo(fingerprint: string): ConnectionInfo | null {
        if (!this.isServiceRunning()) {
            return null;
        }
        const connection = this.connections.get(fingerprint);
        if (connection) {
            return {
                fingerprint,
                deviceName: connection.rpc.getTargetDeviceName(),
                connectionType: connection.type,
            };
        }
        return null;
    }

    public getConnectedDevices(): ConnectionInfo[] {
        if (!this.isServiceRunning()) {
            return [];
        }
        const fingerprints = Array.from(this.connections.keys());
        return fingerprints.map(fingerprint => this.getConnectionInfo(fingerprint));
    }

    @assertServiceRunning
    public async getRemoteServiceController<T extends RPCController>(fingerprint: string): Promise<T> {
        // check if the connection exists
        const connection = this.connections.get(fingerprint);
        if (connection) {
            return connection.controllerProxy.controller as T;
        }

        const isInProgress = this.connectionLock.has(fingerprint);
        const signal = this.setupConnectionLock(fingerprint);

        return new Promise<T>((resolve, reject) => {
            const binding = signal.add((data: RPCController | Error) => {
                signal.detach(binding);
                if (data instanceof Error) {
                    reject(data);
                    return;
                }
                resolve(data as T);
            });

            if (!isInProgress) {
                // Create the connection
                this.createConnection<T>(fingerprint);
            }
        });
    }

    private setupConnectionLock(fingerprint: string): Signal<[RPCController | Error]> {
        let lockSignal = this.connectionLock.get(fingerprint);
        if (!lockSignal) {
            lockSignal = new Signal<[RPCController | Error]>();
            this.connectionLock.set(fingerprint, lockSignal);
        }
        return lockSignal;
    }

    public getConnectionInterface(type: ConnectionType): ConnectionInterface | null {
        const connectionInterface = this.connectionInterfaces.get(type);
        if (connectionInterface) {
            return connectionInterface;
        }
        return null;
    }

    /**
     * Check if a connection interface is enabled via user preference.
     * Defaults to true if no preference is set.
     */
    public isConnectionInterfaceEnabled(type: ConnectionType): boolean {
        const localSc = modules.getLocalServiceController();
        const value = localSc.app.getUserPreference(CON_IFACE_PREF_KEY + type);
        return value !== false; // default true
    }

    /**
     * Enable or disable a connection interface.
     * Starts or stops the interface immediately and persists the preference.
     */
    public async setConnectionInterfaceEnabled(type: ConnectionType, enabled: boolean): Promise<void> {
        const localSc = modules.getLocalServiceController();
        await localSc.app.setUserPreference(CON_IFACE_PREF_KEY + type, enabled);
        const connectionInterface = this.connectionInterfaces.get(type);
        if (!connectionInterface) return;
        if (enabled && !connectionInterface.isActive()) {
            await connectionInterface.start();
        } else if (!enabled && connectionInterface.isActive()) {
            await connectionInterface.stop();
        }
    }

    /**
     * Get the enabled/disabled status of all connection interfaces.
     */
    public getConnectionInterfaceStatuses(): { type: ConnectionType; enabled: boolean }[] {
        const statuses: { type: ConnectionType; enabled: boolean }[] = [];
        for (const type of this.connectionInterfaces.keys()) {
            statuses.push({ type, enabled: this.isConnectionInterfaceEnabled(type) });
        }
        return statuses;
    }

    private async createConnection<T extends RPCController>(fingerprint: string) {
        const signal = this.setupConnectionLock(fingerprint);
        const candidates = await this.getCandidates(fingerprint);
        // append available candidates from cache
        const cachedCandidates = this.getAvailableCandidates(fingerprint);
        for (const cachedCandidate of cachedCandidates) {
            // Avoid duplicates
            if (!candidates.find(c => c === cachedCandidate)) {
                candidates.push(cachedCandidate);
            }
        }
        if (candidates.length === 0) {
            const err = new Error('ERR_NO_CANDIDATES');
            if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === signal) {
                signal.dispatch(err);
                this.connectionLock.delete(fingerprint);
            }
            return null;
        }
        // Sort candidates by priority (higher priority first)
        candidates.sort((a, b) => {
            const priorityA = a.priority || 0;
            const priorityB = b.priority || 0;
            return priorityB - priorityA;
        });
        for (const candidate of candidates) {
            if (candidate.fingerprint === fingerprint) {
                const connectionInterface = this.getConnectionInterface(candidate.connectionType);
                if (connectionInterface && connectionInterface.isActive()) {
                    try {
                        console.log(`[NetService] Connecting to ${fp(fingerprint)} on ${candidate.connectionType}`);
                        const dataChannel = await connectionInterface.connect(candidate);
                        this.removeAvailableCandidate(fingerprint, candidate);
                        const sc = await this.setupConnection(candidate.connectionType, fingerprint, dataChannel);
                        return sc as T;
                    }
                    catch (error) {
                        console.error(`[NetService] Error connecting to ${fp(fingerprint)} on ${candidate.connectionType}:`, error);
                    }
                }
            }
        }
        // No connection could be established, trigger brokered local connect as last resort
        try {
            console.log(`[NetService] Trying brokered local connect for ${fp(fingerprint)}`);
            await this.requestConnectLocal(fingerprint);
            // Sleep for a short while to allow incoming connection to arrive and resolve the lock
            await sleep(6000);
        } catch (error) {
            console.error(`[NetService] Error requesting brokered local connect for ${fp(fingerprint)}:`, error);
        }
        if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === signal) {
            signal.dispatch(new Error('ERR_CONNECTION_FAILED'));
            this.connectionLock.delete(fingerprint);
        }
        return null;
    }

    // Looks up connections and standby connections
    private getConnectionRecord(fingerprint: string, rpcId?: string): ConnectionRecord | null {
        const connection = this.connections.get(fingerprint);
        if (connection) {
            if (!rpcId || connection.rpcId === rpcId) {
                return connection;
            }
        }
        const standbyList = this.standbyConnections.get(fingerprint);
        if (standbyList && standbyList.length > 0) {
            if (!rpcId) {
                return standbyList[0];
            }
            for (const standbyConnection of standbyList) {
                if (standbyConnection.rpcId === rpcId) {
                    return standbyConnection;
                }
            }
        }
        return null;
    }

    private removeConnectionRecord(fingerprint: string, rpcId: string): void {
        const connection = this.connections.get(fingerprint);
        if (connection && connection.rpcId === rpcId) {
            this.connections.delete(fingerprint);
            return;
        }
        const standbyList = this.standbyConnections.get(fingerprint);
        if (standbyList && standbyList.length > 0) {
            const index = standbyList.findIndex(conn => conn.rpcId === rpcId);
            if (index !== -1) {
                standbyList.splice(index, 1);
                if (standbyList.length === 0) {
                    this.standbyConnections.delete(fingerprint);
                }
            }
        }
    }

    private setupConnection(type: ConnectionType, fingerprint_: string | null, dataChannel: GenericDataChannel): Promise<RPCController> {
        const connInterface = this.connectionInterfaces.get(type);
        console.log(`[NetService] Setting up connection for ${fp(fingerprint_ || 'incoming connection')} on ${type}`);
        // Create a connection lock if fingerprint is known
        if (fingerprint_) {
            this.setupConnectionLock(fingerprint_);
        }
        return new Promise<RPCController>((resolve, reject) => {
            let isResolved = false;
            const rpcId = `rpc_${rpcCounter++}`;
            const rpc = new RPCPeer({
                isSecure: connInterface?.isSecure || false,
                pingIntervalMs: 5000,
                fingerprint: fingerprint_,
                id: rpcId,
                dataChannel,
                handlers: {
                    signalEvent: (fqn, args) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        const connection = this.getConnectionRecord(fingerprint, rpcId);
                        if (connection) {
                            const proxy = connection.controllerProxy;
                            proxy.publishSignal(fqn, args);
                        }
                    },
                    signalSubscribe: (fqn) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        const connection = this.getConnectionRecord(fingerprint, rpcId);
                        const serviceController = modules.ServiceController.getLocalInstance();
                        const signal = serviceController.getSignal(fqn);
                        // Check if already subscribed.
                        if (connection.signalSubs.has(fqn)) {
                            return;
                        }
                        const metadata = signal.getMetadata();
                        if (!metadata || !metadata.isExposed) {
                            throw new Error(`Signal ${fqn} is not exposed.`);
                        }
                        const signalRef = signal.add((...args) => {
                            const connection = this.getConnectionRecord(fingerprint, rpcId);
                            if (connection) {
                                const rpc = connection.rpc;
                                rpc.sendSignal(fqn, args);
                            }
                        });
                        connection.signalSubs.set(fqn, signalRef);
                    },
                    signalUnsubscribe: (fqn) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        const connection = this.getConnectionRecord(fingerprint, rpcId);
                        const serviceController = modules.ServiceController.getLocalInstance();
                        const signal = serviceController.getSignal(fqn);
                        const signalRef = connection.signalSubs.get(fqn);
                        if (signalRef) {
                            signal.detach(signalRef);
                            connection.signalSubs.delete(fqn);
                        }
                    },
                    methodCall: async (fqn: string, args: any[]) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        if (!fingerprint) {
                            throw new Error(`ERR_FINGERPRINT_NOT_RESOLVED`);
                        }
                        const serviceController = modules.ServiceController.getLocalInstance();
                        const { obj, funcName } = serviceController.getCallable(fqn);
                        // Check if peer can access the method here
                        const methodInfo = getMethodInfo(obj[funcName]);
                        const [canAccess, err] = serviceController.app.checkAccess(fingerprint, fqn, methodInfo);
                        if (!canAccess) {
                            throw (err || new Error(`ERR_ACCESS_DENIED`));
                        }
                        if (methodInfo.passContext) {
                            const peerInfo = serviceController.app.getPeer(fingerprint);
                            const context: MethodContext = {
                                fingerprint,
                                connectionType: type,
                                peerInfo,
                                fqn,
                            };
                            if (args.length > 0) {
                                args[0] = context;
                            } else {
                                args.push(context);
                            }
                        }
                        return await obj[funcName](...args);
                    },
                },

                onClose: (rpc) => {
                    const fingerprint = rpc.getTargetFingerprint();
                    console.log(`[NetService] Connection closed for ${fp(fingerprint)} on ${type}`, isResolved ? '(already resolved)' : '');
                    const connection = this.getConnectionRecord(fingerprint, rpcId);
                    const isprimaryLine = this.connections.get(fingerprint)?.rpcId === rpcId;
                    if (!!connection) {
                        console.log(`[NetService] Cleaning up connection for ${fp(fingerprint)} on ${type}, ID=`, connection.rpcId);
                        // Clean up
                        const proxy = this.serviceControllerProxyFactory.get(fingerprint);
                        if (proxy && isprimaryLine) {
                            proxy.unsetHandlers();
                        }
                        const serviceController = modules.ServiceController.getLocalInstance();
                        // Unsubscribe all signals
                        for (const [fqn, signalRef] of connection.signalSubs) {
                            const signal = serviceController.getSignal(fqn);
                            signal.detach(signalRef);
                        }
                        if (isprimaryLine) {
                            // Notify about removed connection
                            this.connectionSignal.dispatch(SignalEvent.REMOVE, this.getConnectionInfo(fingerprint));
                        }
                        // Remove the connection
                        this.removeConnectionRecord(fingerprint, rpcId);
                    }
                    if (!isResolved) {
                        if (fingerprint) {
                            const lockSignal = this.connectionLock.get(fingerprint);
                            if (lockSignal) {
                                lockSignal.dispatch(new Error('ERR_CONNECTION_CLOSED'));
                                this.connectionLock.delete(fingerprint);
                            }
                        }
                        reject(new Error('ERR_CONNECTION_CLOSED'));
                        isResolved = true;
                    }

                    // Try to reconnect if auto-connect is enabled
                    if (fingerprint && isprimaryLine) {
                        this.scheduleReconnect(fingerprint);
                    }
                },

                onReady: (rpc) => {
                    const fingerprint = rpc.getTargetFingerprint();
                    console.log(`[NetService] Connection ready, ID=`, rpcId);
                    const proxy = this.serviceControllerProxyFactory.getOrCreate(fingerprint);
                    setProxyHandlers(proxy, rpc);

                    const connRec: ConnectionRecord = {
                        type,
                        rpc,
                        controllerProxy: proxy,
                        signalSubs: new Map(),
                        rpcId,
                    };

                    // If there is a primary connection, move it to standby and promote the new one
                    const existingConnection = this.connections.get(fingerprint);
                    if (existingConnection) {
                        console.log(`[NetService] Existing primary connection found for ${fp(fingerprint)}, moving it to standby and promoting new connection as primary, ID=`, rpcId);
                        if (!this.standbyConnections.has(fingerprint)) {
                            this.standbyConnections.set(fingerprint, []);
                        }
                        this.standbyConnections.get(fingerprint)!.push(existingConnection);
                        existingConnection.rpc.setStandby(true);
                    } else {
                        console.log(`[NetService] No existing connection for ${fp(fingerprint)}, setting new connection as primary, ID=`, rpcId);
                    }

                    // Set the new connection as primary
                    this.connections.set(fingerprint, connRec);

                    // Cancel any pending reconnect timer
                    this.cancelReconnect(fingerprint);

                    // If there is a connection lock, resolve it
                    const lockSignal = this.connectionLock.get(fingerprint);
                    if (lockSignal) {
                        lockSignal.dispatch(proxy.controller);
                        this.connectionLock.delete(fingerprint);
                    }

                    // Notify about new connection (or updated primary)
                    this.connectionSignal.dispatch(SignalEvent.ADD, this.getConnectionInfo(fingerprint));
                    resolve(proxy.controller);
                    isResolved = true;
                }
            });
        });
    }

    private static RECONNECT_MAX_ATTEMPTS = 3;
    private static RECONNECT_BASE_DELAY_MS = 2000;

    private cancelReconnect(fingerprint: string) {
        const timer = this.reconnectTimers.get(fingerprint);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(fingerprint);
        }
    }

    private scheduleReconnect(fingerprint: string, attempt: number = 0) {
        if (!this.autoConnectFingerprints.has(fingerprint) || !this.isServiceRunning()) return;
        if (attempt >= NetService.RECONNECT_MAX_ATTEMPTS) {
            console.log(`[NetService] Reconnect attempts exhausted for ${fp(fingerprint)}, relying on auto-connect.`);
            return;
        }
        // Cancel any existing timer for this fingerprint
        this.cancelReconnect(fingerprint);
        const delay = NetService.RECONNECT_BASE_DELAY_MS * Math.pow(2, attempt); // 2s, 4s, 8s
        console.log(`[NetService] Scheduling reconnect for ${fp(fingerprint)} in ${delay}ms (attempt ${attempt + 1}/${NetService.RECONNECT_MAX_ATTEMPTS})`);
        const timer = setTimeout(() => {
            this.reconnectTimers.delete(fingerprint);
            if (!this.isServiceRunning()) return;
            if (this.connections.has(fingerprint)) return; // already reconnected
            if (!this.autoConnectFingerprints.has(fingerprint)) return; // auto-connect removed
            console.log(`[NetService] Attempting reconnect for ${fp(fingerprint)} (attempt ${attempt + 1})`);
            this.getRemoteServiceController(fingerprint).then(() => {
                console.log(`[NetService] Reconnect successful for ${fp(fingerprint)}`);
            }).catch((err) => {
                console.warn(`[NetService] Reconnect failed for ${fp(fingerprint)}:`, err?.message);
                this.scheduleReconnect(fingerprint, attempt + 1);
            });
        }, delay);
        this.reconnectTimers.set(fingerprint, timer);
    }

    async requestConnectLocal(fingerprint: string): Promise<void> {
        const tcpInterface = this.getConnectionInterface(ConnectionType.LOCAL);
        if (!tcpInterface || !tcpInterface.isActive()) {
            console.warn('[NetService] Cannot request local connect, TCP interface not available or inactive.');
            return;
        }
        const addresses = filterValidBonjourIps(tcpInterface.getServiceAddresses());
        const port = tcpInterface.getServicePort();
        if (addresses.length === 0 || !port) {
            console.warn('[NetService] Cannot request local connect, no local addresses or port available.');
            return;
        }
        const localSc = modules.getLocalServiceController();
        const isServerConnected = localSc.account.isServerConnected();
        if (!isServerConnected) {
            console.warn('[NetService] Cannot get brokered candidate, not connected to account server.');
            return;
        }
        const isPeerOnline = await localSc.account.isPeerOnline(fingerprint);
        if (!isPeerOnline) {
            console.warn('[NetService] Cannot get brokered candidate, peer is offline.');
            return;
        }
        await localSc.account.requestPeerConnect(fingerprint, addresses, port);
    }

    @assertServiceRunning
    public async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        const candidates: PeerCandidate[] = [];
        for (const [type, connectionInterface] of this.connectionInterfaces) {
            if (!connectionInterface.isActive()) continue;
            try {
                const interfaceCandidates = await connectionInterface.getCandidates(fingerprint);
                for (const candidate of interfaceCandidates) {
                    candidates.push({
                        ...candidate,
                        connectionType: type,
                    });
                }
            } catch (error) {
                console.error(`[NetService] Error getting candidates from ${type}:`, error);
            }
        }
        return candidates;
    }

    @serviceStartMethod
    public async start() {
        const promises: Promise<void>[] = [];
        for (const [type, connectionInterface] of this.connectionInterfaces) {
            if (!this.isConnectionInterfaceEnabled(type)) {
                console.log(`[NetService] Skipping start for disabled interface: ${type}`);
                continue;
            }
            promises.push(connectionInterface.start());
        }
        await Promise.all(promises);
    }

    @serviceStopMethod
    public async stop() {
        const promises: Promise<void>[] = [];
        for (const connectionInterface of this.connectionInterfaces.values()) {
            promises.push(connectionInterface.stop());
        }
        await Promise.all(promises);
    }
}

function setProxyHandlers(proxy: RPCControllerProxy, rpc: RPCPeer) {
    proxy.setHandlers({
        signalEvent: (fqn, args) => {
            throw new Error(`Signal events cannot be published remotely, they can only be subscribed to.`);
        },
        signalSubscribe: (fqn) => {
            rpc.subscribeSignal(fqn);
        },
        signalUnsubscribe: (fqn) => {
            rpc.unsubscribeSignal(fqn);
        },
        methodCall: async (fqn, args) => {
            return await rpc.call(fqn, args);
        },
    });
}
