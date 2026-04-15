import os from "os";
import NodeWebcInterface from "nodeShared/webcInterface";
import { DatagramCompat } from "shared/compat";
import { filterValidBonjourIps } from "shared/utils";
import { createBestDatagram } from "../dgramCompat";

export default class DesktopWebcInterface extends NodeWebcInterface {
    createDatagramSocket(): DatagramCompat {
        return createBestDatagram();
    }

    protected override async getLocalAddresses(): Promise<string[]> {
        // Get addresses directly from OS network interfaces — no dependency on LOCAL/TCP
        const addresses: string[] = [];
        const interfaces = os.networkInterfaces();
        for (const ifaceName of Object.keys(interfaces)) {
            const iface = interfaces[ifaceName];
            if (!iface) continue;
            for (const addrInfo of iface) {
                if (addrInfo.family === 'IPv4' && !addrInfo.internal) {
                    addresses.push(addrInfo.address);
                }
            }
        }
        const filtered = filterValidBonjourIps(addresses);
        if (filtered.length > 0) return filtered;
        // Fallback to base implementation (LOCAL interface)
        return super.getLocalAddresses();
    }
}
