import Bonjour, { Browser, Service } from 'bonjour-service';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import { DiscoveryBase } from 'shared/discoveryBase';
import os from 'os';
import { safeIp } from 'shared/utils';

export default class Discovery extends DiscoveryBase {
    // bonjour-service for browsing + publishing on non-Windows
    private bonjour: Bonjour | null = null;
    private browser: Browser | null = null;
    public port: number;
    protected onFoundCallback: ((pc: PeerCandidate) => void) | null = null;
    // Dedup window: suppress duplicate discovery events for the same fingerprint
    private static readonly DEDUP_WINDOW_MS = 3000;
    private lastSeenTimestamps: Map<string, number> = new Map();

    protected isDuplicate(fingerprint: string): boolean {
        const now = Date.now();
        const lastSeen = this.lastSeenTimestamps.get(fingerprint);
        if (lastSeen && (now - lastSeen) < Discovery.DEDUP_WINDOW_MS) {
            return true;
        }
        this.lastSeenTimestamps.set(fingerprint, now);
        return false;
    }

    constructor(port: number) {
        super();
        this.port = port;
    }

    protected getBonjour() {
        if (!this.bonjour) {
            this.bonjour = new Bonjour(undefined, (err: any) => {
                if (err) {
                    console.error('[Discovery] Error starting bonjour browser:', err);
                }
            });
        }
        return this.bonjour;
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
        if (this.browser) {
            this.browser.stop();
            this.browser.removeAllListeners();
        }
        this.browser = this.getBonjour().find({
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
            const txt = service.txt as BonjourTxt;

            if (this.isDuplicate(txt.fpt)) return;

            console.debug('[Discovery] Service found:', service.name, service.addresses.map(a => safeIp(a)));
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
        // Use bonjour-service for publishing on non-Windows platforms
        this.getBonjour().publish({
            name: serviceInfo.name,
            type: serviceInfo.type,
            port: this.port,
            txt: serviceInfo.txt,
        });
        console.log('[Discovery] mDNS service published via bonjour-service.');

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

        // Unpublish bonjour-service
        if (this.bonjour) {
            promises.push(
                new Promise<void>((resolve) => {
                    this.getBonjour().unpublishAll(() => {
                        resolve();
                    });
                })
            );
        }

        // Destroy bonjour browser
        promises.push(
            new Promise<void>((resolve) => {
                if (this.browser) {
                    this.browser.stop();
                }
                if (this.bonjour) {
                    this.getBonjour().destroy(() => {
                        resolve();
                    });
                }
                else {
                    resolve();
                }
            })
        );

        await Promise.all(promises);
        return super.goodbye();
    }
}
