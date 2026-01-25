import { PeerCandidate, BonjourTxt, ConnectionType, DeviceInfo } from 'shared/types';
import { getIconKey } from 'shared/utils';
import Zeroconf, { Service } from 'react-native-zeroconf';
import { AppState, AppStateStatus } from 'react-native';

const SERVICE_TYPE = 'mcservice';

export default class Discovery {
    private zeroconf: Zeroconf;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;
    private port: number;
    private isPublished: boolean = false;
    private isScanning: boolean = false;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    constructor(port: number) {
        console.log('[Discovery] Initializing with port:', port);
        this.port = port;
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('error', (err) => {
            console.error('[Discovery] Zeroconf error:', err);
        });
        this.zeroconf.on('resolved', (service) => {
            console.log('[Discovery] Found service:', service);
            if (this.onFoundCallback) {
                const pc = this.serviceToPeerCandidate(service);
                if (pc) {
                    this.onFoundCallback(pc);
                }
            }
        });
        this.zeroconf.on('start', () => console.log('[Discovery] Bonjour scan has started.'));
        this.zeroconf.on('stop', () => console.log('[Discovery] Bonjour scan has stopped.'));
        this.zeroconf.on('published', () => {
            console.log('[Discovery] Service published.');
            this.isPublished = true;
        });

        this.setupAppStateListener();
    }

    private setupAppStateListener(): void {
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    }

    private handleAppStateChange = (state: AppStateStatus): void => {
        console.log(`[Discovery] App state changed to: ${state}`);
        if (state === 'background' || state === 'inactive') {
            this.handleEnterBackground();
        } else if (state === 'active') {
            this.handleEnterForeground();
        }
    };

    private handleEnterBackground(): void {
        console.log('[Discovery] Entering background, stopping scan...');
        if (this.isScanning) {
            this.zeroconf.stop('DNSSD');
            // Don't set isScanning to false - we want to remember to restart
        }
    }

    private handleEnterForeground(): void {
        console.log('[Discovery] Entering foreground...');
        if (this.isScanning) {
            console.log('[Discovery] Restarting scan...');
            this.isScanning = false; // Reset to allow scan to start
            this.scan();
        }
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        this.onFoundCallback = callback;
    }

    scan(): void {
        if (this.isScanning) {
            console.log('[Discovery] Scan already in progress, skipping...');
            return;
        }
        console.log('[Discovery] Starting scan for services...');
        this.isScanning = true;
        this.zeroconf.scan(SERVICE_TYPE, 'tcp', 'local.', 'DNSSD');
    }

    stopScan(): void {
        if (!this.isScanning) {
            return;
        }
        this.isScanning = false;
        this.zeroconf.stop('DNSSD');
    }

    hello(deviceInfo: DeviceInfo, port?: number): void {
        const name = modules.config.FINGERPRINT.slice(0, 8);
        if (port) {
            this.port = port;
        }
        console.log(`[Discovery] Publishing service: ${name} on port ${this.port}`);
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
            } as BonjourTxt
        );
    }

    unpublish(): void {
        if (this.isPublished) {
            console.log('[Discovery] Unpublishing service...');
            this.zeroconf.unpublishService(modules.config.FINGERPRINT.slice(0, 8));
            this.isPublished = false;
        }
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

    async goodbye(): Promise<void> {
        console.log('[Discovery] Goodbye - stopping scan and unpublishing...');
        this.unpublish();
        this.stopScan();

        // Remove app state listener
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }
}
