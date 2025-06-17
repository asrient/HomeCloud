import { Service, serviceStartMethod, serviceStopMethod, exposed, allowAll, withContext } from "./primatives";
import { MethodContext, MethodInfo, PeerInfo, StoreNames, NativeAskConfig } from "../types";
import ConfigStorage from "../storage";
import { getIconKey } from "../utils";

export class AppService extends Service {
    protected store: ConfigStorage;
    protected allowPairing: boolean = true;

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.APP);
        await this.store.load();
    }

    public isPairingAllowed(): boolean {
        return this.allowPairing;
    }

    public setPairingAllowed(allowed: boolean) {
        this.allowPairing = allowed;
    }

    public getPeers(): PeerInfo[] {
        return this.store.getItem<PeerInfo[]>('peers') || [];
    }

    public getPeer(fingerprint: string): PeerInfo | null {
        const peers = this.getPeers();
        const peer = peers.find((peer) => peer.fingerprint === fingerprint);
        return peer || null;
    }

    protected async removePeerFromStore(fingerprint: string) {
        const peers = this.getPeers();
        const ind = peers.findIndex((peer) => peer.fingerprint === fingerprint);
        if (ind == -1) {
            throw new Error(`Peer ${fingerprint} not found.`);
        }
        const peer = peers.splice(ind, 1)[0];
        this.store.setItem('peers', peers);
        await this.store.save();
        return peer;
    }

    protected async addPeerToStore(peer: PeerInfo) {
        const peers = this.getPeers();
        const existingPeer = peers.find((p) => p.fingerprint === peer.fingerprint);
        if (existingPeer) {
            console.warn(`Peer ${peer.fingerprint} already exists. Updating existing peer.`);
            Object.assign(existingPeer, peer);
        }
        else {
            peers.push(peer);
        }
        this.store.setItem('peers', peers);
        await this.store.save();
        // notify the addition
        return peer;
    }

    public async removePeer(fingerprint: string) {
        await this.removePeerFromStore(fingerprint);
        // notify the removal
        try {
            const remoteService = await modules.ServiceController.getRemoteInstance(fingerprint);
            await remoteService.app.notifyRemoval();
        } catch (error) {
            console.error(`Error notifying ${fingerprint} about removal:`, error);
        }
    }

    @exposed
    @withContext
    public async notifyRemoval(ctx?: MethodContext) {
        if (!ctx) {
            throw new Error("Context is required.");
        }
        console.log(`Notify Removal: Peer ${ctx.fingerprint} removed.`);
        // remove the peer from the store
        await this.removePeerFromStore(ctx.fingerprint);
        // notify the peer
        // this.emit('peerRemoved', fingerprint);
    }

    @exposed
    public async peerInfo(): Promise<PeerInfo> {
        const localSc = modules.getLocalServiceController();
        const deviceInfo = await localSc.system.getDeviceInfo();
        const peer: PeerInfo = {
            fingerprint: modules.config.FINGERPRINT,
            deviceName: modules.config.DEVICE_NAME,
            version: modules.config.VERSION,
            deviceInfo,
            iconKey: getIconKey(deviceInfo),
        };
        return peer;
    }

    public async initiatePairing(fingerprint: string): Promise<PeerInfo> {
        const remotePeer = await modules.ServiceController.getRemoteInstance(fingerprint);
        // Get the peer info from the remote service
        console.log(`Initiating pairing with peer:`, fingerprint);
        const peerInfo = await remotePeer.app.requestPairing(null, await this.peerInfo());
        // make sure fingerprint matches
        if (peerInfo.fingerprint !== fingerprint) {
            throw new Error("Fingerprint mismatch.");
        }
        // Add the peer to the store
        await this.addPeerToStore(peerInfo);
        // Alert the user about the new peer
        const localSc = modules.getLocalServiceController();
        localSc.system.alert("New Device Paired", `Device ${peerInfo.deviceName} (${peerInfo.fingerprint}) has been paired successfully.`);
        return peerInfo;
    }

    @exposed
    @allowAll
    @withContext
    public async requestPairing(ctx: MethodContext | null, remotePeerInfo: PeerInfo): Promise<PeerInfo> {
        // Check if pairing is allowed
        if (!this.isPairingAllowed()) {
            throw new Error("Pairing is not allowed.");
        }
        // make sure fingerprint matches with context
        if (ctx.fingerprint !== remotePeerInfo.fingerprint) {
            throw new Error("Fingerprint mismatch.");
        }
        // Ask the user if they want to pair with the peer
        const deviceName = remotePeerInfo.deviceName || "Unknown Device";
        const os = remotePeerInfo.deviceInfo.os || "Unknown OS";
        const fingerprint = remotePeerInfo.fingerprint;
        const localSc = modules.getLocalServiceController();
        return new Promise<PeerInfo>((resolve, reject) => {
            localSc.system.ask({
                title: `Pair with ${deviceName}?`,
                description: `A device with fingerprint ${fingerprint} (${os}) wants to pair with this device.`,
                buttons: [
                    {
                        text: "Cancel",
                        type: "default",
                        isDefault: true,
                        onPress: () => {
                            console.log("Pairing cancelled by user.");
                            reject(new Error("Pairing cancelled by user."));
                        }
                    },
                    {
                        text: "Pair",
                        type: "primary",
                        isHighlighted: true,
                        onPress: async () => {
                            console.log(`Pairing with ${deviceName} (${fingerprint})...`);
                            // Add the peer to the store
                            await this.addPeerToStore(remotePeerInfo);
                            resolve(this.peerInfo());
                        }
                    }
                ]
            })
        });
    }

    public checkAccess(fingerprint: string, fqn: string, info: MethodInfo): [boolean, string | null] {
        console.log('checkAccess', fingerprint, fqn, info);
        if (!info.isExposed) {
            return [false, `Method ${fqn} is not exposed.`];
        }
        if (!info.isAllowAll) {
            // todo: Check if peer can access the method here.
            return [false, 'Access denied.'];
        }
        return [true, null];
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
