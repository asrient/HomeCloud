import Bonjour, { Browser, Service } from 'bonjour-service';
import { getResponder, CiaoService, Responder } from '@homebridge/ciao';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import { DiscoveryBase } from 'shared/discoveryBase';
import os from 'os';

// Use ciao for publishing on Windows by default (better TXT record support)
// Use bonjour-service on other platforms
const USE_CIAO = process.platform === 'win32';

export default class Discovery extends DiscoveryBase {
    // Use bonjour-service for browsing (discovery)
    private bonjour: Bonjour;
    private browser: Browser;
    // Use @homebridge/ciao for publishing on Windows (better TXT record support)
    private ciaoResponder: Responder | null = null;
    private ciaoService: CiaoService | null = null;
    public port: number;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;

    constructor(port: number) {
        super();
        this.port = port;
        // Initialize bonjour-service for browsing (and publishing on non-Windows)
        this.bonjour = new Bonjour(undefined, (err: any) => {
            if (err) {
                console.error('Error starting bonjour browser:', err);
            }
        });
        // Initialize ciao responder for publishing only on Windows
        if (USE_CIAO) {
            this.ciaoResponder = getResponder();
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
        if (this.browser) {
            this.browser.stop();
            this.browser.removeAllListeners();
        }
        this.browser = this.bonjour.find({
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

        if (USE_CIAO && this.ciaoResponder) {
            // Use ciao for publishing (RFC 6762/6763 compliant, better Windows support)
            this.ciaoService = this.ciaoResponder.createService({
                name: serviceInfo.name,
                hostname: os.hostname(),
                type: serviceInfo.type,
                port: this.port,
                txt: serviceInfo.txt,
            });

            this.ciaoService.advertise().then(() => {
                console.log('mDNS service published via ciao');
            }).catch((err) => {
                console.error('Error publishing mDNS service:', err);
            });
        } else {
            // Use bonjour-service for publishing on non-Windows platforms
            this.bonjour.publish({
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

        if (USE_CIAO) {
            // End ciao service advertisement
            if (this.ciaoService) {
                promises.push(
                    this.ciaoService.end().then(() => {
                        this.ciaoService?.destroy();
                        this.ciaoService = null;
                    })
                );
            }

            // Shutdown ciao responder
            if (this.ciaoResponder) {
                promises.push(this.ciaoResponder.shutdown());
            }
        } else {
            // Unpublish bonjour-service
            promises.push(
                new Promise<void>((resolve) => {
                    this.bonjour.unpublishAll(() => {
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
                this.bonjour.destroy(() => {
                    resolve();
                });
            })
        );

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
