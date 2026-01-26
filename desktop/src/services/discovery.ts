import Bonjour, { Browser, Service } from 'bonjour-service';
import { getResponder, CiaoService, Responder } from '@homebridge/ciao';
import { getIconKey } from 'shared/utils';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import os from 'os';

const SERVICE_TYPE = 'mcservice';

// Use ciao for publishing on Windows by default (better TXT record support)
// Use bonjour-service on other platforms
const USE_CIAO = process.platform === 'win32';

export default class Discovery {
    // Use bonjour-service for browsing (discovery)
    private bonjour: Bonjour;
    private browser: Browser;
    // Use @homebridge/ciao for publishing on Windows (better TXT record support)
    private ciaoResponder: Responder | null = null;
    private ciaoService: CiaoService | null = null;
    public port: number;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;

    constructor(port: number) {
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

    listen() {
        if (this.browser) {
            this.browser.stop();
            this.browser.removeAllListeners();
        }
        this.browser = this.bonjour.find({
            type: SERVICE_TYPE,
            protocol: 'tcp'
        });
        this.browser.start();
        this.browser.on('up', (service: Service) => {
            if (!Discovery.isServiceVaild(service)) {
                return;
            }
            const candidate = Discovery.serviceToCandidate(service);
            if (this.onFoundCallback) {
                this.onFoundCallback(candidate);
            }
        });
    }

    onCandidateFound(callback: (candidate: PeerCandidate) => void): void {
        this.onFoundCallback = callback;
    }

    static isServiceVaild(service: Service): boolean {
        if (!service.txt) {
            return false;
        }
        const txt = service.txt as BonjourTxt;
        if (!txt.fpt || !txt.nme || !txt.icn) {
            console.warn('DEBUG: Bonjour Browser returned an unexpected service:', service);
            return false;
        }
        if (service.addresses.length === 0) {
            return false;
        }
        const fingerprint = txt.fpt;
        if (!modules.config.IS_DEV && fingerprint === modules.config.FINGERPRINT) {
            return false;
        }
        return true;
    }

    static serviceToCandidate(service: Service): PeerCandidate {
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
            if (!Discovery.isServiceVaild(service)) {
                return;
            }
            candidates.push(Discovery.serviceToCandidate(service));
        });
        return candidates;
    }

    hello(deviceInfo: DeviceInfo) {
        const name = `${os.hostname()}-${modules.config.FINGERPRINT.slice(0, 8)}`;
        const txtRecords: BonjourTxt = {
            ver: String(modules.config.VERSION || 'dev'),
            icn: String(getIconKey(deviceInfo)),
            nme: String(modules.config.DEVICE_NAME),
            fpt: String(modules.config.FINGERPRINT),
        };

        if (USE_CIAO && this.ciaoResponder) {
            // Use ciao for publishing (RFC 6762/6763 compliant, better Windows support)
            this.ciaoService = this.ciaoResponder.createService({
                name: name,
                hostname: os.hostname(),
                type: SERVICE_TYPE,
                port: this.port,
                txt: txtRecords,
            });

            this.ciaoService.advertise().then(() => {
                console.log('mDNS service published via ciao');
            }).catch((err) => {
                console.error('Error publishing mDNS service:', err);
            });
        } else {
            // Use bonjour-service for publishing on non-Windows platforms
            this.bonjour.publish({
                name: name,
                type: SERVICE_TYPE,
                port: this.port,
                txt: txtRecords,
            });
            console.log('mDNS service published via bonjour-service');
        }
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
