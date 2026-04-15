import { PeerCandidate, BonjourTxt, DeviceInfo, ConnectionType } from 'shared/types';
import NodeDiscovery from 'nodeShared/discovery';
import { useNativeDiscovery, getNativeModule, NativeServiceInfo } from './nativeDiscovery';
import os from 'os';
import { safeIp } from 'shared/utils';

export default class DesktopDiscovery extends NodeDiscovery {
    // Track services discovered via native API for getCandidates()
    private nativeServices: Map<string, NativeServiceInfo> = new Map();

    override listen() {
        if (useNativeDiscovery()) {
            const native = getNativeModule();
            const queryName = `_${this.SERVICE_TYPE}._${this.PROTOCOL}.local`;
            native.startBrowse(queryName, (service: NativeServiceInfo) => {
                const txt = service.txt as BonjourTxt;
                if (!txt || !service.addresses || service.addresses.length === 0) {
                    return;
                }

                // Store for getCandidates()
                if (txt.fpt) {
                    this.nativeServices.set(txt.fpt, service);
                }

                // Cache for address lookups (allows loopback for caching)
                if (this.validateTxtRecords(txt, false)) {
                    this.cacheCandidate(service.addresses, txt, service.port);
                }

                // Skip invalid / loopback services
                if (!this.validateTxtRecords(txt)) {
                    return;
                }

                const candidate: PeerCandidate = {
                    data: {
                        host: service.addresses[0],
                        port: service.port,
                        hosts: service.addresses,
                    },
                    connectionType: ConnectionType.LOCAL,
                    fingerprint: txt.fpt,
                    deviceName: txt.nme,
                    iconKey: txt.icn,
                };

                if (this.isDuplicate(txt.fpt)) return;

                console.debug('[Discovery] Service found:', service.name, service.addresses.map(a => safeIp(a)));

                if (this.onFoundCallback) {
                    this.onFoundCallback(candidate);
                }
            });
        } else {
            return super.listen();
        }
    }

    override getCandidates(silent = true): PeerCandidate[] {
        if (useNativeDiscovery()) {
            const candidates: PeerCandidate[] = [];
            this.nativeServices.forEach((service) => {
                const txt = service.txt as BonjourTxt;
                if (this.validateTxtRecords(txt, false)) {
                    this.cacheCandidate(service.addresses, txt, service.port);
                }
                if (!this.validateTxtRecords(txt)) {
                    return;
                }
                candidates.push({
                    data: {
                        host: service.addresses[0],
                        port: service.port,
                        hosts: service.addresses,
                    },
                    connectionType: ConnectionType.LOCAL,
                    fingerprint: txt.fpt,
                    deviceName: txt.nme,
                    iconKey: txt.icn,
                });
            });
            return candidates;
        } else {
            return super.getCandidates(silent);
        }
    }

    override hello(deviceInfo: DeviceInfo) {
        if (useNativeDiscovery()) {
            const serviceInfo = this.buildServiceInfo(deviceInfo);
            const native = getNativeModule();
            const instanceName = `${serviceInfo.name}._${serviceInfo.type}._${serviceInfo.protocol}.local`;
            const hostname = `${os.hostname()}.local`;
            native.registerService(instanceName, hostname, this.port, serviceInfo.txt as Record<string, string>);
            console.log('[Discovery] mDNS service published via native DNS-SD API.');
        } else {
            return super.hello(deviceInfo);
        }
    }

    override async goodbye() {
        if (useNativeDiscovery()) {
            const native = getNativeModule();
            native.deregisterService();
            native.stopBrowse();
            this.nativeServices.clear();
        }
        return super.goodbye();
    }
}
