import { PeerCandidate, BonjourTxt, ConnectionType } from 'shared/types';
import Zeroconf, { Service } from 'react-native-zeroconf';

const SERVICE_TYPE = 'hc-agent';

export default class Discovery {
    private zeroconf: Zeroconf;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;

    constructor() {
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('error', (err) => {
            console.error('Zeroconf error:', err);
        });
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        this.onFoundCallback = callback;
    }

    scan() {
        this.zeroconf.on('resolved', (service) => {
            console.log('Found service:', service);
            if (this.onFoundCallback) {
                const pc = this.serviceToPeerCandidate(service);
                if (pc) {
                    this.onFoundCallback(pc);
                }
            }
        });
        this.zeroconf.scan(SERVICE_TYPE, 'tcp');
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

    private serviceToPeerCandidate(service: Service): PeerCandidate | null {
        if (!Discovery.isServiceVaild(service)) {
            console.warn('Invalid service discovered, skipping:', service.name);
            return null;
        }
        const txt = service.txt as BonjourTxt;
        console.log('Addresses found for service:', service.name, service.addresses);
        return {
            data: {
                host: service.addresses[0],
                port: service.port,
            },
            connectionType: ConnectionType.LOCAL,
            fingerprint: txt.fingerprint,
            deviceName: txt.deviceName,
            iconKey: txt.iconKey,
        };
    }

    getCandidates(silent = true): PeerCandidate[] {
        if (!silent) {
            this.scan();
        }
        const candidates: PeerCandidate[] = [];
        const servicesMap = this.zeroconf.getServices();
        Object.values(servicesMap).forEach((service: Service) => {
            const pc = this.serviceToPeerCandidate(service);
            if (pc) {
                candidates.push(pc);
            }
        });
        return candidates;
    }

    async goodbye() {
        this.zeroconf.stop();
    }
}
