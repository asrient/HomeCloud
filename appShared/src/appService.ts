import { Service, serviceStartMethod, serviceStopMethod, exposed, allowAll, withContext } from "./servicePrimatives";
import { MethodContext, MethodInfo, PeerInfo, StoreNames, SignalEvent } from "./types";
import ConfigStorage from "./storage";
import { getIconKey } from "./utils";
import Signal from "./signals";

export class AppService extends Service {
    protected store: ConfigStorage;
    protected allowPairing: boolean = true;

    private lastPeerListSync: number = 0;
    private isPeerInfoPushed: boolean = false;

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.APP);
        await this.store.load();

        // Setup account hooks
        const localSc = modules.getLocalServiceController();
        localSc.account.accountLinkedSignal.add(async () => {
            console.log("Account linked - resyncing peer list...");
            await this.resyncPeerList();
        });

        localSc.account.accountUnlinkedSignal.add(async () => {
            console.log("Account unlinked - resetting peer list...");
            await this.resetPeersInStore();
        });

        localSc.account.websocketConnectedSignal.add(async () => {
            console.log("WebSocket connected - resyncing peer list...");
            await this.resyncPeerListIfNeeded();
            await this.pushPeerInfoIfNeeded();
        });

        localSc.account.peerAddedSignal.add(async (peer: PeerInfo) => {
            console.log("Account peer added - adding to peer list...", peer.fingerprint);
            await this.addPeerToStore(peer);
        });

        localSc.account.peerRemovedSignal.add(async (peer: PeerInfo) => {
            console.log("Account peer removed - removing from peer list...", peer.fingerprint);
            await this.removePeerFromStore(peer.fingerprint);
        });
    }

    public async resyncPeerListIfNeeded() {
        const now = Date.now();
        if (now - this.lastPeerListSync > 60 * 1000) { // 1 min
            return this.resyncPeerList();
        }
    }

    public async resyncPeerList() {
        const localSc = modules.getLocalServiceController();
        if (!localSc.account.isLinked()) {
            console.log("Account not linked. Skipping peer list resync.");
            return;
        }
        console.log("Resyncing peer list from server...");
        let remotePeers: PeerInfo[] = [];
        try {
            remotePeers = await localSc.account.getPeerList();
        } catch (err) {
            console.error("Failed to fetch peer list from server:", err);
            return;
        }
        this.lastPeerListSync = Date.now();
        const localPeers = this.getPeers();
        const localPeerMap = new Map<string, PeerInfo>();
        localPeers.forEach((peer) => {
            localPeerMap.set(peer.fingerprint, peer);
        });
        // Add or update peers
        for (const remotePeer of remotePeers) {
            console.log("Adding/updating peer from server:", remotePeer);
            await this.addPeerToStore(remotePeer);
            localPeerMap.delete(remotePeer.fingerprint);
        }
        // Remove peers that are no longer present
        for (const [fingerprint,] of localPeerMap) {
            await this.removePeerFromStore(fingerprint);
        }
        console.log("Peer list resynced.");
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

    public peerSignal = new Signal<[SignalEvent, PeerInfo]>();

    protected async removePeerFromStore(fingerprint: string) {
        const peers = this.getPeers();
        const ind = peers.findIndex((peer) => peer.fingerprint === fingerprint);
        if (ind == -1) {
            throw new Error(`Peer ${fingerprint} not found.`);
        }
        const peer = peers.splice(ind, 1)[0];
        this.store.setItem('peers', peers);
        await this.store.save();
        this.peerSignal.dispatch(SignalEvent.REMOVE, peer);
        return peer;
    }

    protected async resetPeersInStore() {
        this.store.setItem('peers', []);
        await this.store.save();
    }

    protected async addPeerToStore(peer: PeerInfo) {
        // skip self in production
        if (peer.fingerprint === modules.config.FINGERPRINT && !modules.config.IS_DEV) {
            console.log("Skipping self peer during resync.", peer);
            return null;
        }
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
        if (existingPeer) {
            this.peerSignal.dispatch(SignalEvent.UPDATE, peer);
        } else {
            this.peerSignal.dispatch(SignalEvent.ADD, peer);
        }
        return peer;
    }

    public async pushPeerInfoUpdate() {
        const localSc = modules.getLocalServiceController();
        if (!localSc.account.isLinked()) {
            console.log("Account not linked. Skipping peer info update.");
            return;
        }
        try {
            await localSc.account.updatePeerInfo(await this.peerInfo());
            this.isPeerInfoPushed = true;
        } catch (err) {
            console.error("Failed to update peer info:", err);
        }
    }

    public async pushPeerInfoIfNeeded() {
        if (!this.isPeerInfoPushed) {
            await this.pushPeerInfoUpdate();
            this.isPeerInfoPushed = true;
        }
    }

    public async linkAccount(email: string) {
        const localSc = modules.getLocalServiceController();
        const peerInfo = await this.peerInfo();
        return localSc.account.initiateLink(email, peerInfo);
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

    public checkAccess(fingerprint: string, fqn: string, info: MethodInfo): [boolean, string | null] {
        // console.log('checkAccess', fingerprint, fqn, info);
        if (!info.isExposed) {
            return [false, `Method ${fqn} is not exposed.`];
        }
        if (!info.isAllowAll) {
            const peer = this.getPeer(fingerprint);
            if (!peer) {
                return [false, 'Access denied.'];
            }
        }
        return [true, null];
    }

    @serviceStartMethod
    public async start() {
        this.resyncPeerListIfNeeded();
        this.pushPeerInfoIfNeeded();
        // dummy await for 6 sec
        // await new Promise((resolve) => setTimeout(resolve, 6 * 1000));
    }

    @serviceStopMethod
    public async stop() {
    }
}
