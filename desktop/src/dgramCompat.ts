import { DatagramCompat } from "shared/compat";
import { importModule } from "./utils";
import { platform } from "os";
import { UserPreferences } from "./types";
import { Datagram_ } from "nodeShared/netCompat";

// ── WinRT DatagramSocket wrapper ────────────────────────────────────
// Uses Windows.Networking.Sockets.DatagramSocket via native addon.
// This is necessary for MSIX AppContainer where Win32 Winsock (Node.js dgram)
// doesn't fully respect network capabilities like internetClientServer.

interface DatagramWinModule {
    createSocket(callback: (event: string, ...args: any[]) => void): number;
    bind(handle: number, port?: number): { address: string; family: string; port: number };
    send(handle: number, data: Uint8Array | Buffer, port: number, address: string): void;
    address(handle: number): { address: string; family: string; port: number };
    close(handle: number): void;
}

let datagramWinModule: DatagramWinModule | null = null;

function getDatagramWinModule(): DatagramWinModule {
    if (!datagramWinModule) {
        datagramWinModule = importModule("DatagramWin") as DatagramWinModule;
    }
    return datagramWinModule;
}

export class WinRTDatagram extends DatagramCompat {
    private handle: number | null = null;
    private _address?: { address: string; family: string; port: number };

    constructor() {
        super();
        const mod = getDatagramWinModule();
        this.handle = mod.createSocket((event: string, ...args: any[]) => {
            switch (event) {
                case 'message': {
                    const [msg, rinfo] = args;
                    if (this.onMessage) {
                        // msg comes as Buffer from native side
                        this.onMessage(new Uint8Array(msg), rinfo);
                    }
                    break;
                }
                case 'error': {
                    const [errMsg] = args;
                    if (this.onError) {
                        this.onError(new Error(errMsg));
                    }
                    break;
                }
                case 'close': {
                    if (this.onClose) {
                        this.onClose();
                    }
                    break;
                }
            }
        });
    }

    async bind(port?: number, _address?: string): Promise<void> {
        if (this.handle === null) {
            throw new Error('Socket not initialized');
        }
        const mod = getDatagramWinModule();
        const addr = mod.bind(this.handle, port);
        this._address = addr;
        if (this.onListen) {
            this.onListen();
        }
    }

    address(): { address: string; family: string; port: number } {
        if (this._address) {
            return this._address;
        }
        throw new Error('Socket is not bound');
    }

    async send(data: Uint8Array, port: number, address: string): Promise<void> {
        if (this.handle !== null) {
            const mod = getDatagramWinModule();
            mod.send(this.handle, data, port, address);
        }
    }

    close(): void {
        if (this.handle !== null) {
            const mod = getDatagramWinModule();
            try {
                mod.close(this.handle);
            } catch (e) {
                // Already closed
            }
            this.handle = null;
            this._address = undefined;
        }
    }
}

/**
 * Create the best available DatagramCompat for the current environment.
 * - On Windows MSIX (packaged app): uses WinRT DatagramSocket
 * - Otherwise: uses Node.js dgram
 */
export function createBestDatagram(): DatagramCompat {
    if (platform() === 'win32') {
        try {
            const localSc = modules.getLocalServiceController();
            const useWinRT = localSc.app.getUserPreferenceSync(UserPreferences.USE_WINRT_DGRAM);
            if (useWinRT) {
                console.log('[Datagram] Using WinRT DatagramSocket.');
                return new WinRTDatagram();
            }
        } catch (e) {
            console.warn('[Datagram] Failed to create WinRT datagram, falling back to Node.js dgram:', e);
        }
    }
    return new Datagram_();
}
