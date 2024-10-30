import Bonjour, { Browser, Service } from 'bonjour-service';
import { envConfig } from '../envConfig';
import { getIconKey } from '../utils';
import { getDeviceInfo } from '../utils/deviceInfo';
import { AgentCandidate, BonjourTxt } from './types';

const SERVICE_PREFIX = 'Homecloud_Agent';
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

    getCandidates(silent = true): AgentCandidate[] {
        if (!this.browser) {
            throw new Error('Discovery service is not listening.');
        }
        if (!silent) {
            this.browser.update();
        }
        const candidates: AgentCandidate[] = [];
        this.browser.services.forEach((service: Service) => {
            const txt = service.txt as BonjourTxt;
            if (service.port !== envConfig.AGENT_PORT || !txt.fingerprint || !txt.deviceName || !txt.iconKey) {
                console.warn('DEBUG: Bonjour Browser returned an unexpected service:', service);
                return;
            }
            if (service.addresses.length === 0) {
                return;
            }
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
        const name = `${SERVICE_PREFIX}_${envConfig.FINGERPRINT}`;
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
