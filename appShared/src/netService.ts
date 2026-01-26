import { Service, serviceStartMethod, serviceStopMethod, RPCController, getMethodInfo, assertServiceRunning, RPCControllerProxy } from "./servicePrimatives";
import { GenericDataChannel, PeerCandidate, ConnectionType, MethodContext, ConnectionInfo, SignalEvent } from "./types";
import { RPCPeer } from "./rpc";
import Signal, { SignalNodeRef } from "./signals";

let rpcCounter = 0;

type ConnectionRecord = {
    type: ConnectionType;
    rpc: RPCPeer;
    controllerProxy: RPCControllerProxy;
    signalSubs: Map<string, SignalNodeRef<any, any>>;
    rpcId: string;
};

export abstract class ConnectionInterface {
    abstract onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void;
    abstract connect(candidate: PeerCandidate): Promise<GenericDataChannel>;
    abstract getCandidates(fingerprint?: string): Promise<PeerCandidate[]>;
    abstract onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void;

    isSecure: boolean;

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
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

    private connectionInterfaces: Map<ConnectionType, ConnectionInterface>;

    private autoConnectFingerprints: Map<string, Set<string>> = new Map();

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
            connectionInterface.onIncomingConnection((dataChannel) => {
                this.setupConnection(type, null, dataChannel).catch((error) => {
                    console.error(`[NetService] Error setting up incoming connection on ${type}:`, error);
                });
            });
            connectionInterface.onCandidateAvailable((candidate) => {
                this.handleCandidateAvailable(type, candidate);
            });
        });
    }

    private async handleCandidateAvailable(type: ConnectionType, candidate: PeerCandidate) {
        const fingerprint = candidate.fingerprint;
        if (fingerprint && this.autoConnectFingerprints.has(fingerprint)) {
            // Check if already connected
            // if (this.connections.has(fingerprint)) {
            //     console.log(`[NetService] Already connected to ${fingerprint}, skipping auto-connect.`);
            //     return;
            // }
            // Check if there is already a connection in progress
            if (this.connectionLock.has(fingerprint)) {
                console.log(`[NetService] Connection already in progress for ${fingerprint}, skipping auto-connect.`);
                return;
            }
            // Acquire the lock
            const newSignal = this.setupConnectionLock(fingerprint);
            try {
                console.log(`[NetService] Auto-connecting to candidate ${fingerprint} on ${type}`);
                const connectionInterface = this.connectionInterfaces.get(type);
                if (connectionInterface) {
                    const dataChannel = await connectionInterface.connect(candidate);
                    // Check lock still exists
                    if (!this.connectionLock.has(fingerprint)) {
                        console.log(`[NetService] Connection lock released for ${fingerprint} while auto-connecting on ${type}, aborting.`);
                        dataChannel.disconnect();
                        return;
                    }
                    await this.setupConnection(type, fingerprint, dataChannel);
                }
            } catch (error) {
                console.error(`[NetService] Error auto-connecting to candidate ${fingerprint} on ${type}:`, error);
                if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === newSignal) {
                    newSignal.dispatch(error);
                    this.connectionLock.delete(fingerprint);
                }
            }
        }
    }

    @assertServiceRunning
    public getConnectionInfo(fingerprint: string): ConnectionInfo | null {
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

    @assertServiceRunning
    public async getConnectedDevices(): Promise<ConnectionInfo[]> {
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

            // Create the connection
            this.createConnection<T>(fingerprint);
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

    private async createConnection<T extends RPCController>(fingerprint: string) {
        const signal = this.setupConnectionLock(fingerprint);
        const candidates = await this.getCandidates(fingerprint);
        if (candidates.length === 0) {
            const err = new Error(`No candidates found for fingerprint ${fingerprint}`);
            if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === signal) {
                signal.dispatch(err);
                this.connectionLock.delete(fingerprint);
            }
            return null;
        }
        for (const candidate of candidates) {
            if (candidate.fingerprint === fingerprint) {
                const connectionInterface = this.connectionInterfaces.get(candidate.connectionType);
                if (connectionInterface) {
                    try {
                        console.log(`Connecting to ${fingerprint} on ${candidate.connectionType}`);
                        const dataChannel = await connectionInterface.connect(candidate);
                        const sc = await this.setupConnection(candidate.connectionType, fingerprint, dataChannel);
                        return sc as T;
                    }
                    catch (error) {
                        console.error(`Error connecting to ${fingerprint} on ${candidate.connectionType}:`, error);
                    }
                }
            }
        }
        if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === signal) {
            signal.dispatch(new Error(`No connection interface found for fingerprint ${fingerprint}`));
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
        console.log(`[NetService] Setting up connection for ${fingerprint_ || 'incoming connection'} on ${type}`);
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
                            throw new Error(`[NetService] Fingerprint not resolved for method call ${fqn} on ${type}`);
                        }
                        const serviceController = modules.ServiceController.getLocalInstance();
                        const { obj, funcName } = serviceController.getCallable(fqn);
                        // Check if peer can access the method here
                        const methodInfo = getMethodInfo(obj[funcName]);
                        const [canAccess, err] = serviceController.app.checkAccess(fingerprint, fqn, methodInfo);
                        if (!canAccess) {
                            throw (err || new Error(`Access denied for ${fingerprint} on ${fqn}`));
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
                    console.log(`Connection closed for ${fingerprint} on ${type}`, isResolved ? '(already resolved)' : '');
                    const connection = this.getConnectionRecord(fingerprint, rpcId);
                    const isprimaryLine = this.connections.get(fingerprint)?.rpcId === rpcId;
                    if (!!connection) {
                        console.log(`[NetService] Cleaning up connection for ${fingerprint} on ${type}, ID=`, connection.rpcId);
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
                                lockSignal.dispatch(new Error(`Connection closed for ${fingerprint} on ${type}`));
                                this.connectionLock.delete(fingerprint);
                            }
                        }
                        reject(new Error(`Connection closed for ${fingerprint} on ${type}`));
                        isResolved = true;
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
                        console.log(`[NetService] Existing primary connection found for ${fingerprint}, moving it to standby and promoting new connection as primary, ID=`, rpcId);
                        if (!this.standbyConnections.has(fingerprint)) {
                            this.standbyConnections.set(fingerprint, []);
                        }
                        this.standbyConnections.get(fingerprint)!.push(existingConnection);
                        existingConnection.rpc.setStandby(true);
                    } else {
                        console.log(`[NetService] No existing connection for ${fingerprint}, setting new connection as primary, ID=`, rpcId);
                    }

                    // Set the new connection as primary
                    this.connections.set(fingerprint, connRec);

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

    @assertServiceRunning
    public async getCandidates(fingerprint?: string): Promise<PeerCandidate[]> {
        const candidates: PeerCandidate[] = [];
        for (const [type, connectionInterface] of this.connectionInterfaces) {
            try {
                const interfaceCandidates = await connectionInterface.getCandidates(fingerprint);
                for (const candidate of interfaceCandidates) {
                    candidates.push({
                        ...candidate,
                        connectionType: type,
                    });
                }
            } catch (error) {
                console.error(`Error getting candidates from ${type}:`, error);
            }
        }
        return candidates;
    }

    @serviceStartMethod
    public async start() {
        const promises: Promise<void>[] = [];
        for (const connectionInterface of this.connectionInterfaces.values()) {
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
