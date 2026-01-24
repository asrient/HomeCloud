import Bonjour, { Browser, Service } from 'bonjour-service';
import { getIconKey } from 'shared/utils';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';

const SERVICE_TYPE = 'mcservice';

export default class Discovery {
    private bonjour: Bonjour;
    private browser: Browser;
    public port: number;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;
    constructor(port: number) {
        this.port = port;
        this.bonjour = new Bonjour(undefined, (err: any) => {
            if (err) {
                console.error('Error starting bonjour service:', err);
            }
        });
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
        const txt = service.txt as BonjourTxt;
        if (!txt.fingerprint || !txt.deviceName || !txt.iconKey) {
            console.warn('DEBUG: Bonjour Browser returned an unexpected service:', service);
            return false;
        }
        if (service.addresses.length === 0) {
            return false;
        }
        const fingerprint = service.txt.fingerprint;
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
            fingerprint: txt.fingerprint,
            deviceName: txt.deviceName,
            iconKey: txt.iconKey,
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
        const name = modules.config.FINGERPRINT.slice(0, 8);
        this.bonjour.publish({
            name: name,
            type: SERVICE_TYPE,
            port: this.port,
            txt: {
                version: modules.config.VERSION || 'dev',
                iconKey: getIconKey(deviceInfo),
                deviceName: modules.config.DEVICE_NAME,
                fingerprint: modules.config.FINGERPRINT,
            } as BonjourTxt,
        });
    }
    async goodbye() {
        return new Promise<void>((resolve, reject) => {
            this.bonjour.unpublishAll(() => {
                this.bonjour.destroy((err: any) => {
                    if (err) {
                        console.error('Error stopping bonjour service:', err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });
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
