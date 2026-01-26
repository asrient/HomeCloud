import { PeerCandidate, BonjourTxt, ConnectionType, DeviceInfo } from 'shared/types';
import { getIconKey } from 'shared/utils';
import Zeroconf, { Service } from 'react-native-zeroconf';
import { AppState, AppStateStatus, Platform } from 'react-native';

const SERVICE_TYPE = 'mcservice';
type DiscoveryProtocol = 'DNSSD' | 'NSD';

export default class Discovery {
    private zeroconf: Zeroconf;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;
    private port: number;
    private isPublished: boolean = false;
    private isScanning: boolean = false;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    private lastPublishedDeviceInfo: DeviceInfo | null = null;

    constructor(port: number) {
        console.log('[Discovery] Initializing with port:', port);
        this.port = port;
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('error', (err) => {
            console.error('[Discovery] Zeroconf error:', err);
            // Handle DNS-SD errors (like -72000, -65563) by retrying or stopping
            if (this.isScanning) {
                this.handleScanError(err instanceof Error ? err : new Error(String(err)));
            }
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
            try {
                this.zeroconf.stop(this.currentProtocol);
            } catch (err) {
                console.warn('[Discovery] Error stopping scan on background:', err);
            }
            // Don't set isScanning to false - we want to remember to restart
        }
    }

    private handleEnterForeground(): void {
        console.log('[Discovery] Entering foreground...');

        // On iOS, we need to wait for the system to fully clean up the previous
        // DNS-SD session before starting a new one, otherwise we get error -72000
        setTimeout(() => {
            // Ensure we're still in foreground
            if (AppState.currentState === 'active') {
                // Restart scan if it was running
                if (this.isScanning) {
                    console.log('[Discovery] Restarting scan now...');
                    this.isScanning = false; // Reset to allow scan to start
                    this.scan();
                }

                // Re-publish service if it was published
                if (this.isPublished && this.lastPublishedDeviceInfo) {
                    console.log('[Discovery] Re-publishing service...');
                    this.isPublished = false; // Reset to allow re-publish
                    this.hello(this.lastPublishedDeviceInfo, this.port);
                }
            }
        }, 2000);
    }

    onCandidateAvailable(callback: (candidate: PeerCandidate) => void): void {
        this.onFoundCallback = callback;
    }

    private scanRetryCount: number = 0;
    private readonly MAX_SCAN_RETRIES = 3;
    private currentProtocol: DiscoveryProtocol = 'DNSSD';

    scan(): void {
        if (this.isScanning) {
            console.log('[Discovery] Scan already in progress, skipping...');
            return;
        }
        console.log(`[Discovery] Starting scan for services using ${this.currentProtocol}...`);
        this.isScanning = true;
        this.scanRetryCount = 0;
        this.doScan();
    }

    private doScan(): void {
        try {
            this.zeroconf.scan(SERVICE_TYPE, 'tcp', 'local.', this.currentProtocol);
        } catch (err) {
            console.error('[Discovery] Error starting scan:', err);
            this.handleScanError(err instanceof Error ? err : new Error(String(err)));
        }
    }

    private handleScanError(error?: Error): void {
        // Check if DNS-SD service is not available (common on emulators)
        const errorMessage = error?.message || '';
        const isDnssdNotRunning = errorMessage.includes('SERVICENOTRUNNING') || errorMessage.includes('-65563');

        // On Android, if DNSSD fails, try NSD as fallback
        if (isDnssdNotRunning && Platform.OS === 'android' && this.currentProtocol === 'DNSSD') {
            console.warn('[Discovery] DNS-SD service not available, falling back to NSD...');
            this.currentProtocol = 'NSD';
        }

        if (this.scanRetryCount < this.MAX_SCAN_RETRIES) {
            this.scanRetryCount++;
            const delay = this.scanRetryCount * 1000; // Exponential backoff
            console.log(`[Discovery] Retrying scan in ${delay}ms (attempt ${this.scanRetryCount}/${this.MAX_SCAN_RETRIES})...`);
            setTimeout(() => {
                if (this.isScanning && AppState.currentState === 'active') {
                    this.doScan();
                }
            }, delay);
        } else {
            console.error('[Discovery] Max scan retries reached, giving up');
            this.isScanning = false;
        }
    }

    stopScan(): void {
        if (!this.isScanning) {
            return;
        }
        this.isScanning = false;
        try {
            this.zeroconf.stop(this.currentProtocol);
        } catch (err) {
            console.warn('[Discovery] Error stopping scan:', err);
        }
    }

    hello(deviceInfo: DeviceInfo, port?: number): void {
        const name = modules.config.FINGERPRINT.slice(0, 8);
        if (port) {
            this.port = port;
        }
        this.lastPublishedDeviceInfo = deviceInfo;
        console.log(`[Discovery] Publishing service: ${name} on port ${this.port} using ${this.currentProtocol}`);
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
            this.currentProtocol
        );
    }

    unpublish(): void {
        if (this.isPublished) {
            console.log('[Discovery] Unpublishing service...');
            this.zeroconf.unpublishService(modules.config.FINGERPRINT.slice(0, 8));
            this.isPublished = false;
            this.lastPublishedDeviceInfo = null;
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
