import { Service, serviceStartMethod, serviceStopMethod, exposed, allowAll, withContext } from "./primatives";
import { MethodContext, MethodInfo, PeerInfo, StoreNames } from "../types";
import ConfigStorage from "../storage";

export class AppService extends Service {
    protected store: ConfigStorage;

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.APP);
        await this.store.load();
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

    public async removePeer(fingerprint: string) {
        const peer = await this.removePeerFromStore(fingerprint);
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

    /*
    @exposed
    @allowAll
    public async requestPairing()

    @exposed
    @allowAll
    public async finishPairing()
    */

    public checkAccess(fingerprint: string, fqn: string, info: MethodInfo): [boolean, string | null] {
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
