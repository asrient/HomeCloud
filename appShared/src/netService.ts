import { Service, serviceStartMethod, serviceStopMethod, RPCController, getMethodInfo, assertServiceRunning, RPCControllerProxy } from "./servicePrimatives";
import { GenericDataChannel, PeerCandidate, ConnectionType, MethodContext, ConnectionInfo, SignalEvent } from "./types";
import { RPCPeer } from "./rpc";
import Signal, { SignalNodeRef } from "./signals";

let rpcCounter = 0;

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

    remove(fingerprint: string): void {
        this.instances.delete(fingerprint);
    }
}

export class NetService extends Service {

    private serviceControllerProxyFactory = new ServiceControllerProxyFactory();

    private connections: Map<string, {
        type: ConnectionType;
        rpc: RPCPeer;
        controllerProxy: RPCControllerProxy;
        signalSubs: Map<string, SignalNodeRef<any, any>>;
        rpcId: string;
    }> = new Map();

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
            if (this.connections.has(fingerprint)) {
                // already connected
                console.log(`[NetService] Already connected to candidate ${fingerprint} on ${type}, skipping auto-connect.`);
                return;
            }
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
        // check if there is already a connection in progress
        const signal = this.connectionLock.get(fingerprint);
        if (signal) {
            return new Promise<T>((resolve, reject) => {
                const binding = signal.add((data: RPCController | Error) => {
                    signal.detach(binding);
                    if (data instanceof Error) {
                        reject(data);
                        return;
                    }
                    resolve(data as T);
                });
            });
        }

        // if not, create a new one
        const newSignal = this.setupConnectionLock(fingerprint);

        try {
            const sc = await this.createConnection<T>(fingerprint);
            return sc;
        } catch (error) {
            console.error(`Error creating connection for ${fingerprint}:`, error);
            if (this.connectionLock.has(fingerprint) && this.connectionLock.get(fingerprint) === newSignal) {
                newSignal.dispatch(error);
                this.connectionLock.delete(fingerprint);
            }
            throw error;
        }
    }

    private setupConnectionLock(fingerprint: string): Signal<[RPCController | Error]> {
        let lockSignal = this.connectionLock.get(fingerprint);
        if (!lockSignal) {
            lockSignal = new Signal<[RPCController | Error]>();
            this.connectionLock.set(fingerprint, lockSignal);
        }
        return lockSignal;
    }

    private async createConnection<T extends RPCController>(fingerprint: string): Promise<T> {
        const candidates = await this.getCandidates(fingerprint);
        if (candidates.length === 0) {
            throw new Error(`No candidates found for fingerprint ${fingerprint}`);
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
        throw new Error(`No connection interface found for fingerprint ${fingerprint}`);
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
                        const connection = this.connections.get(fingerprint);
                        if (connection) {
                            const proxy = connection.controllerProxy;
                            proxy.publishSignal(fqn, args);
                        }
                    },
                    signalSubscribe: (fqn) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        const connection = this.connections.get(fingerprint);
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
                            const connection = this.connections.get(fingerprint);
                            if (connection) {
                                const rpc = connection.rpc;
                                rpc.sendSignal(fqn, args);
                            }
                        });
                        connection.signalSubs.set(fqn, signalRef);
                    },
                    signalUnsubscribe: (fqn) => {
                        const fingerprint = rpc.getTargetFingerprint();
                        const connection = this.connections.get(fingerprint);
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

                onClose: () => {
                    const fingerprint = rpc.getTargetFingerprint();
                    console.log(`Connection closed for ${fingerprint} on ${type}`, isResolved ? '(already resolved)' : '');
                    const connection = this.connections.get(fingerprint);
                    if (!!connection && connection.rpcId === rpcId) {
                        console.log(`[NetService] Cleaning up connection for ${fingerprint} on ${type}, ID=`, connection.rpcId);
                        // Clean up
                        const proxy = this.serviceControllerProxyFactory.get(fingerprint);
                        if (proxy) {
                            proxy.unsetHandlers();
                        }
                        const serviceController = modules.ServiceController.getLocalInstance();
                        // Unsubscribe all signals
                        for (const [fqn, signalRef] of connection.signalSubs) {
                            const signal = serviceController.getSignal(fqn);
                            signal.detach(signalRef);
                        }
                        this.connectionSignal.dispatch(SignalEvent.REMOVE, this.getConnectionInfo(fingerprint));
                        // Remove the connection
                        this.connections.delete(fingerprint);
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
                    const isLoopback = fingerprint === modules.config.FINGERPRINT;
                    console.log(`[NetService] Connection ready, ID=`, rpcId);
                    const oldConnection = isLoopback ? null : this.connections.get(fingerprint);
                    if (oldConnection) {
                        const serviceController = modules.ServiceController.getLocalInstance();
                        // Unsubscribe all signals
                        for (const [fqn, signalRef] of oldConnection.signalSubs) {
                            const signal = serviceController.getSignal(fqn);
                            signal.detach(signalRef);
                        }
                    }
                    const proxy = this.serviceControllerProxyFactory.getOrCreate(fingerprint);
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

                    this.connections.set(fingerprint, {
                        type,
                        rpc,
                        controllerProxy: proxy,
                        signalSubs: new Map(),
                        rpcId,
                    });

                    // Check if there is any active connection lock for this fingerprint
                    const lockSignal = this.connectionLock.get(fingerprint);
                    if (lockSignal) {
                        lockSignal.dispatch(proxy.controller);
                        this.connectionLock.delete(fingerprint);
                    }

                    // Notify about new connection
                    this.connectionSignal.dispatch(SignalEvent.ADD, this.getConnectionInfo(fingerprint));
                    resolve(proxy.controller);
                    isResolved = true;

                    setTimeout(() => {
                        // Check if a connection already exists for this fingerprint (race condition with incoming connections)
                        if (oldConnection) {
                            console.log(`[NetService] Duplicate connection detected for ${fingerprint} on ${type}, closing the new one.`);
                            oldConnection.rpc.close();
                        }
                    }, 0);
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
