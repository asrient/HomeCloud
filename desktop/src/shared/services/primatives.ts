import { ProxyHandlers, MethodInfo, SignalMetadata } from '../types';
import Signal from '../signals';

export function exposed(originalMethod: any, context: ClassMethodDecoratorContext) {
    originalMethod.__isExposed = true; // Mark the method as exposed
    return originalMethod;
}

export function allowAll(originalMethod: any, context: ClassMethodDecoratorContext) {
    originalMethod.__allowAll = true; // Mark the method as exposed
    return originalMethod;
}

export function withContext(originalMethod: any, context: ClassMethodDecoratorContext) {
    originalMethod.__withContext = true;
    return originalMethod;
}

export function getMethodInfo(method: any): MethodInfo {
    const isExposed = method.__isExposed === true;
    const isAllowAll = method.__allowAll === true;
    const passContext = method.__withContext === true;
    return { isExposed, isAllowAll, passContext };
}

export function serviceStartMethod(originalMethod: any, context: ClassMethodDecoratorContext) {
    async function wrapper(this: any, ...args: any[]) {
        if (this.isRunning) {
            console.log("Service is already running.");
            return;
        }
        this.isRunning = true;
        console.log("Starting service...");
        try {
            await originalMethod.call(this, ...args);
            console.log("Service started.");
        } catch (error) {
            console.error("Error during service startup:", error);
            this.isRunning = false;
            throw error; // Rethrow the error if needed
        }
    }
    return wrapper;
}

export function serviceStopMethod(originalMethod: any, context: ClassMethodDecoratorContext) {
    async function wrapper(this: any, ...args: any[]) {
        if (!this.isRunning) {
            console.log("Service is not running.");
            return;
        }
        console.log("Stopping service...");
        await originalMethod.call(this, ...args);
        this.isRunning = false;
        console.log("Service stopped.");
    }
    return wrapper;
}

export function assertServiceRunning(originalMethod: any, context: ClassMethodDecoratorContext) {
    return function (this: any, ...args: any[]) {
        if (!this.isRunning) {
            throw new Error("Service is not running.");
        }
        return originalMethod.call(this, ...args);
    };
}

export class Service {
    private isRunning: boolean = false;
    private isInitialized: boolean = false;
    private static instance: Service | null = null;

    static getInstance<T extends Service>(): T {
        if (!this.instance) {
            this.instance = new this() as T;
        }
        return this.instance as T;
    }

    @exposed
    async ping() {
        return "pong";
    }

    protected _init() {
        if (this.isInitialized) {
            throw new Error("Service is already initialized.");
        }
        this.isInitialized = true;
    }
}

export class RPCControllerProxy {
    private handlers: ProxyHandlers | null = null;
    controller: RPCController;
    private signals = new Map<string, Signal<any>>();

    constructor(localInstance: RPCController) {
        this.controller = this.proxyObject<RPCController>("services", localInstance);
    }

    setHandlers(handlers: ProxyHandlers) {
        this.handlers = handlers;
        this.resubcribeSignals();
    }

    private resubcribeSignals() {
        // Resubscribe to all signals
        if (!this.handlers) {
            throw new Error(`Handlers are not set.`);
        }
        this.signals.forEach((_signal, fqn) => {
            this.handlers.signalSubscribe(fqn);
        });
    }

    unsetHandlers() {
        this.handlers = null;
    }

    publishSignal(fqn: string, args: any[]) {
        // Call the signal event with the arguments
        if (this.signals.has(fqn)) {
            const signal = this.signals.get(fqn);
            signal?.dispatch(...args);
        }
    }

    private proxyObject<T extends Object>(prifix: string, obj: T): T {
        // Transform the service instance to use the proxy call
        // This will intercept all method calls and call the proxy call instead
        // console.log(`Proxying object: ${prifix}`);
        const newObj = new Proxy(obj, {
            get: (target, prop) => {
                // console.log(`Accessing property: ${prifix}.${prop.toString()}`);
                // if property does not exist, return undefined
                if (!(prop in target)) {
                    return undefined;
                }
                const type = typeof target[prop];
                const name = prop.toString();
                const fqn = `${prifix}.${name}`;
                if (type === "function") {
                    return async (...args: any[]) => {
                        // Call the proxy call with the method name and arguments
                        if (name.startsWith("constructor")) {
                            return target[prop](...args);
                        }
                        if (target[prop].__isExposed) {
                            if (!this.handlers.methodCall) {
                                throw new Error(`Remote service is not available.`);
                            }
                            return await this.handlers.methodCall(fqn, args);
                        } else {
                            throw new Error(`Method ${fqn} is not exposed.`);
                        }
                    };
                }
                else if (type === "object") {
                    if (target[prop] instanceof Signal) {
                        const metadata = target[prop].getMetadata();
                        if (!metadata || !metadata.isExposed) {
                            return null;
                            // throw new Error(`Signal ${fqn} is not exposed.`);
                        }
                        return {
                            add: (fn: any) => {
                                if (this.signals.has(fqn)) {
                                    return this.signals.get(fqn)?.add(fn);
                                } else {
                                    const signal = new Signal();
                                    this.signals.set(fqn, signal);
                                    if (this.handlers) {
                                        this.handlers.signalSubscribe(fqn);
                                    }
                                    return signal.add(fn);
                                }
                            },
                            detach: (fn: any) => {
                                if (this.signals.has(fqn)) {
                                    const signal = this.signals.get(fqn);
                                    signal?.detach(fn);
                                    if (signal.hasListeners() === false) {
                                        this.signals.delete(fqn);
                                        if (this.handlers) {
                                            this.handlers.signalUnsubscribe(fqn);
                                        }
                                    }
                                }
                            },
                        }
                    }

                    // If the property is an object, we need to proxy it too
                    return this.proxyObject(fqn, target[prop]);
                }
                // throw new Error(`"${fqn}" cannot be used from a proxy, ${type} type is not supported.`);
                return null; // Return null for unsupported types
            },

            set(target, prop, value) {
                throw new Error(`"${prifix}.${prop.toString()}" cannot be used from a proxy, ${typeof target[prop]} type is not supported.`);
            }
        });

        return newObj;
    }
}

export class RPCController {

    private getAttr(fqn: string): any {
        // Get the callable function from the proxy object
        const parts = fqn.split(".");
        let obj = this;
        // fqn should start with "services."
        if (parts[0] !== "services") {
            throw new Error(`FQN "${fqn}" is not valid, fqn should start with "services"`);
        }
        // Remove the first part of the fqn
        parts.shift();
        // Loop through the parts of the fqn and get the object
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (obj && obj[part]) {
                obj = obj[part];
            } else {
                throw new Error(`FQN: ${fqn} not found.`);
            }
        }
        return obj;
    }

    getCallable(fqn: string): { obj: any, funcName: string } {
        // Get the callable function from the object
        // get the parent object of the function
        const objParts = fqn.split(".");
        const funcName = objParts.pop();
        const objPath = objParts.join(".");
        const obj = this.getAttr(objPath);
        if (!obj || !(funcName in obj)) {
            throw new Error(`FQN: ${fqn} not found.`);
        }
        // Only functions are correct type of callable
        if (typeof obj[funcName] !== "function") {
            throw new Error(`Function ${fqn} is not callable.`);
        }
        return { obj, funcName };
    }

    getSignal(fqn: string): Signal {
        // Get the signal from the object
        const obj = this.getAttr(fqn);
        if (obj instanceof Signal) {
            return obj;
        } else {
            throw new Error(`FQN: ${fqn} is a signal.`);
        }
    }
}
