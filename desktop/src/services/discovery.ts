import Bonjour, { Browser, Service } from 'bonjour-service';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import { DiscoveryBase } from 'shared/discoveryBase';
import { useNativeDiscovery, getNativeModule, NativeServiceInfo } from './nativeDiscovery';
import os from 'os';

export default class Discovery extends DiscoveryBase {
    // bonjour-service for browsing + publishing on non-Windows
    private bonjour: Bonjour | null = null;
    private browser: Browser | null = null;
    // Track services discovered via native API for getCandidates()
    private nativeServices: Map<string, NativeServiceInfo> = new Map();
    public port: number;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;

    constructor(port: number) {
        super();
        this.port = port;

        if (!useNativeDiscovery()) {
            // Initialize bonjour-service for non-Windows platforms
            this.bonjour = new Bonjour(undefined, (err: any) => {
                if (err) {
                    console.error('Error starting bonjour browser:', err);
                }
            });
        }
    }

    private getHostAddresses(): string[] {
        const addresses: string[] = [];
        const interfaces = os.networkInterfaces();
        for (const ifaceName of Object.keys(interfaces)) {
            const iface = interfaces[ifaceName];
            if (!iface) continue;
            for (const addrInfo of iface) {
                if (addrInfo.family === 'IPv4' && !addrInfo.internal) {
                    addresses.push(addrInfo.address);
                }
            }
        }
        return addresses;
    }

    listen() {
        if (useNativeDiscovery()) {
            const native = getNativeModule();
            const queryName = `_${this.SERVICE_TYPE}._${this.PROTOCOL}.local`;
            native.startBrowse(queryName, (service: NativeServiceInfo) => {
                const txt = service.txt as BonjourTxt;
                if (!txt || !service.addresses || service.addresses.length === 0) {
                    return;
                }

                // Store for getCandidates()
                if (txt.fpt) {
                    this.nativeServices.set(txt.fpt, service);
                }

                // Cache for address lookups (allows loopback for caching)
                if (this.validateTxtRecords(txt, false)) {
                    this.cacheCandidate(service.addresses, txt, service.port);
                }

                // Skip invalid / loopback services
                if (!this.validateTxtRecords(txt)) {
                    return;
                }

                const candidate: PeerCandidate = {
                    data: {
                        host: service.addresses[0],
                        port: service.port,
                        hosts: service.addresses,
                    },
                    connectionType: ConnectionType.LOCAL,
                    fingerprint: txt.fpt,
                    deviceName: txt.nme,
                    iconKey: txt.icn,
                };

                if (this.onFoundCallback) {
                    this.onFoundCallback(candidate);
                }
            });
            return;
        }

        if (this.browser) {
            this.browser.stop();
            this.browser.removeAllListeners();
        }
        this.browser = this.bonjour!.find({
            type: this.SERVICE_TYPE,
            protocol: this.PROTOCOL,
        });
        this.browser.start();
        this.browser.on('up', (service: Service) => {
            // Validate service allowing loopback for caching
            if (this.isServiceVaild(service, false)) {
                this.cacheCandidate(service.addresses, service.txt as BonjourTxt, service.port);
            }
            if (!this.isServiceVaild(service)) {
                return;
            }
            const candidate = this.serviceToCandidate(service);
            if (this.onFoundCallback) {
                this.onFoundCallback(candidate);
            }
        });
    }

    getCandidateFromCache(fingerprint: string): PeerCandidate | null {
        const cached = this.getCandidateAddressCache(fingerprint);
        if (!cached || cached.addresses.length === 0) {
            return null;
        }
        return {
            data: {
                host: cached.addresses[0],
                port: cached.port,
                hosts: cached.addresses,
            },
            connectionType: ConnectionType.LOCAL,
            fingerprint,
        };
    }

    onCandidateFound(callback: (candidate: PeerCandidate) => void): void {
        this.onFoundCallback = callback;
    }

    isServiceVaild(service: Service, skipLoopback?: boolean): boolean {
        if (service.addresses && service.addresses.length === 0) {
            return false;
        }
        return this.validateTxtRecords(service.txt as BonjourTxt, skipLoopback);
    }

    serviceToCandidate(service: Service): PeerCandidate {
        const txt = service.txt as BonjourTxt;
        return {
            data: {
                host: service.addresses[0],
                port: service.port,
                hosts: service.addresses,
            },
            connectionType: ConnectionType.LOCAL,
            fingerprint: txt.fpt,
            deviceName: txt.nme,
            iconKey: txt.icn,
        };
    }

    getCandidates(silent = true): PeerCandidate[] {
        if (useNativeDiscovery()) {
            const candidates: PeerCandidate[] = [];
            this.nativeServices.forEach((service) => {
                const txt = service.txt as BonjourTxt;
                if (this.validateTxtRecords(txt, false)) {
                    this.cacheCandidate(service.addresses, txt, service.port);
                }
                if (!this.validateTxtRecords(txt)) {
                    return;
                }
                candidates.push({
                    data: {
                        host: service.addresses[0],
                        port: service.port,
                        hosts: service.addresses,
                    },
                    connectionType: ConnectionType.LOCAL,
                    fingerprint: txt.fpt,
                    deviceName: txt.nme,
                    iconKey: txt.icn,
                });
            });
            return candidates;
        }

        if (!this.browser) {
            throw new Error('Discovery service is not listening.');
        }
        if (!silent) {
            this.browser.update();
        }
        const candidates: PeerCandidate[] = [];
        this.browser.services.forEach((service: Service) => {
            if (this.isServiceVaild(service, false)) {
                this.cacheCandidate(service.addresses, service.txt as BonjourTxt, service.port);
            }
            if (!this.isServiceVaild(service)) {
                return;
            }
            candidates.push(this.serviceToCandidate(service));
        });
        return candidates;
    }

    hello(deviceInfo: DeviceInfo) {
        const serviceInfo = this.buildServiceInfo(deviceInfo);

        if (useNativeDiscovery()) {
            const native = getNativeModule();
            const instanceName = `${serviceInfo.name}._${serviceInfo.type}._${serviceInfo.protocol}.local`;
            const hostname = `${os.hostname()}.local`;
            native.registerService(instanceName, hostname, this.port, serviceInfo.txt as Record<string, string>);
            console.log('mDNS service published via native DNS-SD API');
        } else {
            // Use bonjour-service for publishing on non-Windows platforms
            this.bonjour!.publish({
                name: serviceInfo.name,
                type: serviceInfo.type,
                port: this.port,
                txt: serviceInfo.txt,
            });
            console.log('mDNS service published via bonjour-service');
        }
    }

    protected override getName(): string {
        return `${os.hostname()}-${modules.config.FINGERPRINT.slice(0, 8)}`;
    }

    async setup(): Promise<void> {
        await super.setup();
        const hostAddrs = this.getHostAddresses();
        this.updateMyAddresses(hostAddrs);
    }

    async goodbye() {
        const promises: Promise<void>[] = [];

        if (useNativeDiscovery()) {
            const native = getNativeModule();
            native.deregisterService();
            native.stopBrowse();
            this.nativeServices.clear();
        } else {
            // Unpublish bonjour-service
            promises.push(
                new Promise<void>((resolve) => {
                    this.bonjour!.unpublishAll(() => {
                        resolve();
                    });
                })
            );

            // Destroy bonjour browser
            promises.push(
                new Promise<void>((resolve) => {
                    if (this.browser) {
                        this.browser.stop();
                    }
                    this.bonjour!.destroy(() => {
                        resolve();
                    });
                })
            );
        }

        await Promise.all(promises);
        return super.goodbye();
    }
}

/*
// Todo: Finish the implementation of the AgentUpdateService class and initialize it post the Discovery setup.

export class AgentUpdateService {

    updateRecords: Record<string, {
        lastPushToDb: number;
        profiles: ProfileDetails[];
        iconKey: string | null;
        deviceName: string;
        updateTimer: NodeJS.Timeout;
    }> = {};

    private serviceDiscovered(service: Service) {
        if(!Discovery.isServiceVaild(service)) return;
        console.log('New service discovered:', service);
    }

    start() {
        const discoveryService = Discovery.getInstace();
        discoveryService.onUp(this.serviceDiscovered);
    }
}
*/
