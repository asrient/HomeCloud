import { PeerCandidate, BonjourTxt, ConnectionType } from 'shared/types';
import Zeroconf, { Service } from 'react-native-zeroconf';

const SERVICE_TYPE = 'hc-agent';

export default class Discovery {
    private zeroconf: Zeroconf;

    constructor() {
        this.zeroconf = new Zeroconf();
    }

    scan() {
        // this.zeroconf.on('found', (service) => {
        //     console.log('Found service:', service);
        // });
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

    getCandidates(silent = true): PeerCandidate[] {
        if (!silent) {
            this.scan();
        }
        const candidates: PeerCandidate[] = [];
        const servicesMap = this.zeroconf.getServices();
        Object.values(servicesMap).forEach((service: Service) => {
            if (!Discovery.isServiceVaild(service)) {
                return;
            }
            const txt = service.txt as BonjourTxt;
            console.log('Addresses found for service:', service.name, service.addresses);
            candidates.push({
                data: {
                    host: service.addresses[0],
                    port: service.port,
                },
                connectionType: ConnectionType.LOCAL,
                fingerprint: txt.fingerprint,
                deviceName: txt.deviceName,
                iconKey: txt.iconKey,
            });
        });
        return candidates;
    }

    async goodbye() {
        this.zeroconf.stop();
    }
}
