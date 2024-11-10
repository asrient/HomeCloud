import Bonjour, { Browser, Service } from 'bonjour-service';
import { envConfig } from '../envConfig';
import { getIconKey } from '../utils';
import { getDeviceInfo } from '../utils/deviceInfo';
import { AgentCandidate, BonjourTxt } from './types';
import { ProfileDetails } from '../models';

const SERVICE_TYPE = 'hc-agent';

export default class DiscoveryService {
    private static _discovery: DiscoveryService;
    private bonjour: Bonjour;
    private browser: Browser;
    constructor() {
        if (DiscoveryService._discovery) {
            throw new Error('Discovery service already setup');
        }
        this.bonjour = new Bonjour(undefined, (err: any) => {
            if (err) {
                console.error('Error starting bonjour service:', err);
            }
        });
        DiscoveryService._discovery = this;

    }
    static getInstace() {
        if (!this._discovery) {
            throw new Error('Discovery service is not setup');
        }
        return this._discovery;
    }

    static setup() {
        return new DiscoveryService();
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
    }

    onUp(cb: (s: Service) => void) {
        this.browser.on('up', cb);
    }

    static isServiceVaild(service: Service): boolean {
        const txt = service.txt as BonjourTxt;
        if (service.port !== envConfig.AGENT_PORT || !txt.fingerprint || !txt.deviceName || !txt.iconKey) {
            console.warn('DEBUG: Bonjour Browser returned an unexpected service:', service);
            return false;
        }
        if (service.addresses.length === 0) {
            return false;
        }
        const fingerprint = service.txt.fingerprint;
        if (!envConfig.IS_DEV && fingerprint === envConfig.FINGERPRINT) {
            return false;
        }
        return true;
    }

    getCandidates(silent = true): AgentCandidate[] {
        if (!this.browser) {
            throw new Error('Discovery service is not listening.');
        }
        if (!silent) {
            this.browser.update();
        }
        const candidates: AgentCandidate[] = [];
        this.browser.services.forEach((service: Service) => {
            if (!DiscoveryService.isServiceVaild(service)) {
                return;
            }
            const txt = service.txt as BonjourTxt;
            candidates.push({
                host: service.addresses[0],
                fingerprint: txt.fingerprint,
                deviceName: txt.deviceName,
                iconKey: txt.iconKey,
            });
        });
        return candidates;
    }

    hello() {
        const deviceInfo = getDeviceInfo();
        const name = envConfig.FINGERPRINT.slice(0, 8);
        this.bonjour.publish({
            name: name,
            type: SERVICE_TYPE,
            port: envConfig.AGENT_PORT,
            txt: {
                version: envConfig.VERSION || 'dev',
                iconKey: getIconKey(deviceInfo),
                deviceName: envConfig.DEVICE_NAME,
                fingerprint: envConfig.FINGERPRINT,
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
// Todo: Finish the implementation of the AgentUpdateService class and initialize it post the DiscoveryService setup.

export class AgentUpdateService {

    updateRecords: Record<string, {
        lastPushToDb: number;
        profiles: ProfileDetails[];
        iconKey: string | null;
        deviceName: string;
        updateTimer: NodeJS.Timeout;
    }> = {};

    private serviceDiscovered(service: Service) {
        if(!DiscoveryService.isServiceVaild(service)) return;
        console.log('New service discovered:', service);
    }

    start() {
        const discoveryService = DiscoveryService.getInstace();
        discoveryService.onUp(this.serviceDiscovered);
    }
}
*/
