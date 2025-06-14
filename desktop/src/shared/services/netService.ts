import { Service, serviceStartMethod, serviceStopMethod, exposed, RPCController, getMethodInfo, assertServiceRunning, RPCControllerProxy } from "./primatives";
import { ProxyHandlers, GenericDataChannel, PeerCandidate, ConnectionType, MethodContext } from "../types";
import { RPCPeer, RPCPeerOptions } from "../net/rpc";
import Signal, { SignalNodeRef } from "../signals";


export abstract class ConnectionInterface {
    abstract onIncomingConnection(callback: (dataChannel: GenericDataChannel) => void): void;
    abstract connect(candidate: PeerCandidate): Promise<GenericDataChannel>;
    abstract getCandidates(fingerprint?: string): Promise<PeerCandidate[]>;

    isSecure: boolean;

    abstract start(): Promise<void>;
    abstract stop(): Promise<void>;
}

class ServiceControllerProxyFactory {
    private instances: Map<string, WeakRef<RPCControllerProxy>> = new Map();

    get(fingerprint: string) {
        const ref = this.instances.get(fingerprint);
        if (ref) {
            const proxy = ref.deref();
            if (proxy) {
                return proxy;
            }
            this.instances.delete(fingerprint);
        }
    }

    getOrCreate(fingerprint: string): RPCControllerProxy {
        let proxy = this.get(fingerprint);
        if (proxy) {
            return proxy;
        }
        const localSc = modules.ServiceController.getLocalInstance();
        proxy = new RPCControllerProxy(localSc);
        const weakRef = new WeakRef(proxy);
        this.instances.set(fingerprint, weakRef);
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
    }> = new Map();

    private connectionLock: Map<string, Signal<[RPCController | Error]>> = new Map();

    private connectionInterfaces: Map<ConnectionType, ConnectionInterface>;

    public init(connectionInterfaces: Map<ConnectionType, ConnectionInterface>) {
        this._init();
        this.connectionInterfaces = connectionInterfaces;
        this.connectionInterfaces.forEach((connectionInterface, type) => {
            connectionInterface.onIncomingConnection((dataChannel) => {
                this.setupConnection(type, null, dataChannel);
            });
        });
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
        const newSignal = new Signal<[RPCController | Error]>();
        this.connectionLock.set(fingerprint, signal);

        try {
            const sc = await this.createConnection<T>(fingerprint);
            newSignal.dispatch(sc);
        } catch (error) {
            console.error(`Error creating connection for ${fingerprint}:`, error);
            newSignal.dispatch(error);
            throw error;
        } finally {
            this.connectionLock.delete(fingerprint);
        }
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

        return new Promise<RPCController>((resolve, reject) => {
            let isResolved = false;
            const rpc = new RPCPeer({
                isSecure: connInterface?.isSecure || false,
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
                    signalUnsubscribe(fqn) {
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
                        const serviceController = modules.ServiceController.getLocalInstance();
                        const method = serviceController.getCallable(fqn);
                        // Check if peer can access the method here
                        const methodInfo = getMethodInfo(serviceController);
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
                        return await method(...args);
                    },
                },

                onClose: () => {
                    const fingerprint = rpc.getTargetFingerprint();
                    console.log(`Connection closed for ${fingerprint} on ${type}`);
                    const connection = this.connections.get(fingerprint);
                    if (!!connection) {
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
                        this.connections.delete(fingerprint);
                    }
                    if (!isResolved) {
                        reject(new Error(`Connection closed for ${fingerprint} on ${type}`));
                    }
                },

                onReady: (rpc) => {
                    const fingerprint = rpc.getTargetFingerprint();
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
                    });

                    resolve(proxy.controller);
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
