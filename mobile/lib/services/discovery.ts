import { PeerCandidate, BonjourTxt, ConnectionType, DeviceInfo } from 'shared/types';
import Zeroconf, { Service } from 'react-native-zeroconf';
import { AppState, AppStateStatus } from 'react-native';
import { DiscoveryBase } from 'shared/discoveryBase';
import { getIpAddressAsync } from 'expo-network';

export default class Discovery extends DiscoveryBase {
    private zeroconf: Zeroconf;
    private onFoundCallback: ((pc: PeerCandidate) => void) | null = null;
    private port: number;
    private isPublished: boolean = false;
    private isScanning: boolean = false;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
    private lastPublishedDeviceInfo: DeviceInfo | null = null;
    private scanRetryCount: number = 0;
    private readonly MAX_SCAN_RETRIES = 2;

    constructor(port: number) {
        super();
        console.log('[Discovery] Initializing with port:', port);
        this.port = port;
        this.zeroconf = new Zeroconf();
        this.zeroconf.on('error', (err) => {
            console.error('[Discovery] Zeroconf error:', err);
            // Handle DNS-SD errors (like -72000) by retrying
            if (this.isScanning) {
                this.handleScanError();
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
                this.zeroconf.stop('DNSSD');
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

    scan(): void {
        if (this.isScanning) {
            console.log('[Discovery] Scan already in progress, skipping...');
            return;
        }
        console.log('[Discovery] Starting scan for services...');
        this.isScanning = true;
        this.scanRetryCount = 0;
        this.doScan();
    }

    private async doScan(): Promise<void> {
        await this.updateHostAddress();
        try {
            this.zeroconf.scan(this.SERVICE_TYPE, this.PROTOCOL, this.DOMAIN, 'DNSSD');
        } catch (err) {
            console.error('[Discovery] Error starting scan:', err);
            this.handleScanError();
        }
    }

    private handleScanError(): void {
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
        this.zeroconf.stop('DNSSD');
    }

    hello(deviceInfo: DeviceInfo, port?: number): void {
        if (port) {
            this.port = port;
        }
        this.lastPublishedDeviceInfo = deviceInfo;
        const serviceInfo = this.buildServiceInfo(deviceInfo);
        console.log('[Discovery] Publishing service with name:', serviceInfo.name, 'on port:', this.port);
        this.zeroconf.publishService(
            serviceInfo.type,
            serviceInfo.protocol,
            serviceInfo.domain,
            serviceInfo.name,
            this.port,
            serviceInfo.txt,
            'DNSSD'
        );
    }

    unpublish(): void {
        if (this.isPublished) {
            console.log('[Discovery] Unpublishing service...');
            this.zeroconf.unpublishService(this.getName(), 'DNSSD');
            this.isPublished = false;
            this.lastPublishedDeviceInfo = null;
        }
    }

    /**
     * Stops only the publish (keeps scanning active).
     * Use this when the server goes offline but we still want to discover peers.
     */
    stopPublish(): void {
        this.unpublish();
    }

    isServiceVaild(service: Service, skipLoopback?: boolean): boolean {
        if (!service.addresses || service.addresses.length === 0) {
            return false;
        }
        return this.validateTxtRecords(service.txt as BonjourTxt, skipLoopback);
    }

    private serviceToPeerCandidate(service: Service, updateCache = true): PeerCandidate | null {
        if (updateCache && this.isServiceVaild(service, false)) {
            this.cacheCandidate(service.addresses, service.txt as BonjourTxt, service.port);
        }
        if (!this.isServiceVaild(service)) {
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
            fingerprint: txt.fpt,
            deviceName: txt.nme,
            iconKey: txt.icn,
        };
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
            },
            connectionType: ConnectionType.LOCAL,
            fingerprint,
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

        return super.goodbye();
    }

    async updateHostAddress(): Promise<void> {
        try {
            const ipAddr = await getIpAddressAsync();
            console.log('[Discovery] Device IP address:', ipAddr);
            if (ipAddr !== '0.0.0.0') {
                this.updateMyAddresses([ipAddr]);
            }
        } catch (err) {
            console.warn('[Discovery] Failed to get device IP address:', err);
        }
    }

    async setup(): Promise<void> {
        await super.setup();
        await this.updateHostAddress();
    }
}
