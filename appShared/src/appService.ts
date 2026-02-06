import { Service, serviceStartMethod, serviceStopMethod, exposed, allowAll, withContext } from "./servicePrimatives";
import { MethodContext, MethodInfo, PeerInfo, StoreNames, SignalEvent, NativeButtonConfig } from "./types";
import ConfigStorage from "./storage";
import { getIconKey } from "./utils";
import Signal from "./signals";
import { helpLinks, HelpLinkType } from "./helpLinks";

export class AppService extends Service {
    protected store: ConfigStorage;
    protected allowPairing: boolean = true;

    private lastPeerListSync: number = 0;
    private isPeerInfoPushed: boolean = false;
    private autoConnectPeers: boolean = false;

    public async init(autoConnectPeers: boolean = false) {
        this._init();
        this.autoConnectPeers = autoConnectPeers;
        console.log(`[AppService] autoConnectPeers=${autoConnectPeers}`);
        this.store = modules.ConfigStorage.getInstance(StoreNames.APP);
        await this.store.load();

        // Setup account hooks
        const localSc = modules.getLocalServiceController();
        localSc.account.accountLinkSignal.add(async (linked) => {
            if (linked) {
                console.log("Account linked - resyncing peer list...");
                await this.resyncPeerList();
            } else {
                console.log("Account unlinked - resetting peer list...");
                await this.resetPeersInStore();
            }
        });

        localSc.account.websocketConnectionSignal.add(async (connected) => {
            if (!connected) return;
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

        this.addPeerListToAutoConnect();
    }

    private addPeerListToAutoConnect() {
        if (!this.autoConnectPeers) return;
        const localSc = modules.getLocalServiceController();
        const peers = this.getPeers();
        peers.forEach((peer) => {
            localSc.net.addAutoConnectFingerprint(peer.fingerprint);
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
            // console.log("Adding/updating peer from server:", remotePeer);
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

    public isOnboarded(): boolean {
        return this.store.getItem<boolean>('onboarded') || false;
    }

    public async setOnboarded(onboarded = true) {
        this.store.setItem('onboarded', onboarded);
        await this.store.save();
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
        // Force remove from auto-connect list
        const localSc = modules.getLocalServiceController();
        localSc.net.removeAutoConnectFingerprint(fingerprint);
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
        if (this.autoConnectPeers) {
            const localSc = modules.getLocalServiceController();
            localSc.net.addAutoConnectFingerprint(peer.fingerprint);
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

    @exposed
    @withContext
    public async receiveContent(ctx: MethodContext | null, content: string, type?: 'text' | 'link' | 'html' | 'rtf'): Promise<void> {
        type = type || 'text';
        console.log(`[AppService] receiveContent called from ${ctx ? ctx.fingerprint : "Unknown"}: type=${type}, content=${content}`);
        const deviceName = ctx && ctx.peerInfo ? ctx.peerInfo.deviceName : "Unknown Device";
        const croppedContent = content.length > 100 ? content.substring(0, 30) + "..." : content;
        const localSc = modules.getLocalServiceController();
        const buttons: NativeButtonConfig[] = [];
        if (type === 'link') {
            buttons.push({
                text: "Open Link",
                type: 'primary',
                isDefault: true,
                onPress: () => {
                    localSc.system.openUrl(content).catch((err) => {
                        console.error("Failed to open URL:", err);
                    });
                },
            });
        }
        buttons.push({
            text: `Copy ${type === 'link' ? 'Link' : 'Text'}`,
            onPress: () => {
                console.log("Copying to clipboard:", content);
                localSc.system.copyToClipboard(content, type);
            },
        });
        buttons.push({ text: "Cancel", type: 'danger', isDefault: true, onPress: () => { } });
        localSc.system.ask({
            title: `${deviceName} sent a ${type === 'link' ? 'link' : 'text'}`,
            description: croppedContent,
            buttons,
        })
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

    /**
     * Check if auto-start at login is enabled.
     * Returns null if not supported on this platform.
     * Override in desktop implementation.
     */
    @exposed
    public async isAutoStartEnabled(): Promise<boolean | null> {
        return null;
    }

    /**
     * Set auto-start at login.
     * No-op if not supported on this platform.
     * Override in desktop implementation.
     */
    @exposed
    public async setAutoStart(_enable: boolean, _openInBackground: boolean = true): Promise<void> {
        // No-op on non-desktop platforms
    }

    /**
     * Toggle auto-start at login.
     * Returns null if not supported on this platform.
     * Override in desktop implementation.
     */
    @exposed
    public async toggleAutoStart(): Promise<boolean | null> {
        return null;
    }

    public async openHelpLink(type: HelpLinkType): Promise<string> {
        const link = helpLinks[type];
        if (!link) {
            throw new Error(`Help link for type ${type} not found.`);
        }
        const localSc = modules.getLocalServiceController();
        await localSc.system.openUrl(link);
        return link;
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
