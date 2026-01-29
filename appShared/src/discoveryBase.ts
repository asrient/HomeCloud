import { getIconKey, isLocalIp, isIpV4, isSameNetwork, filterValidBonjourIps } from "./utils";
import { BonjourTxt, DeviceInfo, StoreNames } from "./types";
import ConfigStorage from "./storage";

// [interface]: ips[]
// Example: { en0: [ '192.168.20.12' ], en5: [ '192.168.20.20' ] }
export type NetworkConfig = {
    [key: string]: string[];
}

// Cache entry for a fingerprint's addresses
interface AddressCacheEntry {
    addresses: string[];
    hostAddress: string;
    timestamp: number;
    port: number;
}

// 3 hours in milliseconds
const CACHE_EXPIRY_MS = 3 * 60 * 60 * 1000;

export class DiscoveryBase {
    protected SERVICE_TYPE = 'mcservice';
    protected DOMAIN = 'local.';
    protected PROTOCOL: 'tcp' | 'udp' = 'tcp';

    protected store: ConfigStorage;
    private hostAddresses: string[] = [];

    protected updateMyAddresses(addresses: string[]): void {
        const filtered = filterValidBonjourIps(addresses);
        if (filtered.length === 0) {
            console.warn('[DiscoveryBase] No valid local addresses found to update my addresses:', addresses);
            return;
        }
        this.hostAddresses = filtered;
    }

    public getHostLocalAddresses(): string[] {
        return filterValidBonjourIps(this.hostAddresses);
    }

    /**
     * Caches IP addresses for a fingerprint along with the interface it was seen on.
     * @param fingerprint - The device fingerprint
     * @param addresses - The IP addresses to cache
     */
    protected cacheCandidate(addresses: string[], txt: BonjourTxt, port: number): void {
        if (!this.store) {
            return;
        }
        if (!addresses || addresses.length === 0 || !txt || !txt.fpt) {
            return;
        }
        const fingerprint = txt.fpt;
        if (fingerprint === modules.config.FINGERPRINT) {
            // Loopback, update my addresses
            this.updateMyAddresses(addresses);
            return;
        }
        // Find which host ip this address belongs to based on network match
        let matchedHost: string | null = null;
        for (const hostIp of this.hostAddresses) {
            for (const addr of addresses) {
                if (isIpV4(addr) && isSameNetwork(hostIp, addr)) {
                    matchedHost = hostIp;
                    break;
                }
            }
            if (matchedHost) break;
        }

        if (!matchedHost) {
            console.warn('[DiscoveryBase] Could not find matching host interface for caching addresses:', addresses, 'hosts:', this.hostAddresses);
            return;
        }

        const cacheEntry: AddressCacheEntry = {
            addresses,
            hostAddress: matchedHost,
            timestamp: Date.now(),
            port,
        };

        this.store.setItem(`addr_${fingerprint}`, cacheEntry);
        // Save asynchronously without blocking
        this.store.save().catch(err => console.warn('[DiscoveryBase] Failed to save address cache:', err));
    }

    /**
     * Retrieves cached IP addresses for a fingerprint if they are still valid.
     * Checks that the cache is not expired and that the addresses are in the same network
     * as the current interface configuration.
     * @param fingerprint - The device fingerprint
     * @returns The cached addresses if valid, null otherwise
     */
    protected getCandidateAddressCache(fingerprint: string): { addresses: string[]; port: number } | null {
        if (!this.store) {
            return null;
        }
        const cacheEntry = this.store.getItem<AddressCacheEntry>(`addr_${fingerprint}`);
        if (!cacheEntry) {
            return null;
        }

        // Check if cache has expired (older than 3 hours)
        const age = Date.now() - cacheEntry.timestamp;
        if (age > CACHE_EXPIRY_MS) {
            // Clean up expired entry
            this.store.deleteKey(`addr_${fingerprint}`);
            this.store.save().catch(err => console.warn('[DiscoveryBase] Failed to save after deleting expired cache:', err));
            return null;
        }

        // Check if net config has changed
        if (!this.hostAddresses.includes(cacheEntry.hostAddress)) {
            return null;
        }

        return { addresses: cacheEntry.addresses, port: cacheEntry.port };
    }

    protected validateTxtRecords(txt: BonjourTxt | undefined, skipLoopback?: boolean): boolean {
        if (!txt) {
            return false;
        }
        if (!txt.fpt || !txt.nme || !txt.icn) {
            console.warn('DEBUG: Bonjour Browser returned an unexpected service:', txt);
            return false;
        }
        const fingerprint = txt.fpt;
        const isLoopback = fingerprint === modules.config.FINGERPRINT;
        if (skipLoopback === undefined && isLoopback && !modules.config.IS_DEV) {
            return false;
        }
        if (isLoopback && skipLoopback) {
            return false;
        }
        return true;
    }

    protected buildServiceInfo(deviceInfo: DeviceInfo) {
        return {
            txt: {
                ver: modules.config.VERSION || 'dev',
                icn: getIconKey(deviceInfo),
                nme: modules.config.DEVICE_NAME,
                fpt: modules.config.FINGERPRINT,
            } as BonjourTxt,
            name: this.getName(),
            type: this.SERVICE_TYPE,
            domain: this.DOMAIN,
            protocol: this.PROTOCOL,
        }
    }

    protected getName(): string {
        return `${modules.config.DEVICE_NAME}-${modules.config.FINGERPRINT.slice(0, 8)}`;
    }

    public async goodbye(): Promise<void> {
    }

    public async setup(): Promise<void> {
        this.store = modules.ConfigStorage.getInstance(StoreNames.DISCOVERY_CACHE);
        await this.store.load();
    }
}
