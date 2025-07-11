import { getIconKey } from 'shared/utils';
import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import Zeroconf, { Service } from 'react-native-zeroconf';

const SERVICE_TYPE = 'hc-agent';

export default class Discovery {
    public port: number;
    private zeroconf: Zeroconf;

    constructor(port: number) {
        this.port = port;
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

    hello(deviceInfo: DeviceInfo) {
        const name = modules.config.FINGERPRINT.slice(0, 8);
        this.zeroconf.publishService(
            SERVICE_TYPE,
            'tcp',
            'local.',
            name,
            this.port,
            {
                version: modules.config.VERSION || 'dev',
                iconKey: getIconKey(deviceInfo),
                deviceName: modules.config.DEVICE_NAME,
                fingerprint: modules.config.FINGERPRINT,
            } as BonjourTxt,
        );
    }

    async goodbye() {
        this.zeroconf.unpublishService(SERVICE_TYPE);
        this.zeroconf.stop();
    }
}
