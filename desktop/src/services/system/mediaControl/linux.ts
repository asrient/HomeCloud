import { AudioPlaybackInfo } from "shared/types";
import dbus from "dbus-next";

type StateCallback = (info: AudioPlaybackInfo | null) => void;

export class LinuxPlaybackWatcher {

    private bus = dbus.sessionBus();
    private onChange: StateCallback;
    private currentPlayer: string | null = null;

    constructor(onStateChange: StateCallback) {
        this.onChange = onStateChange;
        this.initializeActivePlayer();
    }

    private async getActivePlayers(): Promise<string[]> {
        const obj = await this.bus.getProxyObject(
            "org.freedesktop.DBus",
            "/org/freedesktop/DBus"
        );

        const iface = obj.getInterface("org.freedesktop.DBus");
        const names = await iface.ListNames();

        return names.filter((n: string) =>
            n.startsWith("org.mpris.MediaPlayer2.")
        );
    }

    private async initializeActivePlayer(): Promise<void> {
        await this.updateActivePlayer();
        if (this.currentPlayer) {
            await this.subscribe();
        }
    }

    private async updateActivePlayer(): Promise<boolean> {
        try {
            const players = await this.getActivePlayers();
            if (!players.length) {
                this.currentPlayer = null;
                return false;
            }

            // First, check if current player is still playing
            if (this.currentPlayer && players.includes(this.currentPlayer)) {
                try {
                    const obj = await this.bus.getProxyObject(this.currentPlayer, "/org/mpris/MediaPlayer2");
                    const props = obj.getInterface("org.freedesktop.DBus.Properties");
                    const status = await props.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus");
                    if (status.value === "Playing") {
                        return false; // Current player still active, no change
                    }
                } catch {
                    // Current player is invalid, will search for new one
                }
            }

            // Look for any playing player
            for (const player of players) {
                try {
                    const obj = await this.bus.getProxyObject(player, "/org/mpris/MediaPlayer2");
                    const props = obj.getInterface("org.freedesktop.DBus.Properties");
                    const status = await props.Get("org.mpris.MediaPlayer2.Player", "PlaybackStatus");
                    if (status.value === "Playing") {
                        if (this.currentPlayer !== player) {
                            this.currentPlayer = player;
                            await this.subscribe(); // Resubscribe to new player
                            return true;
                        }
                        return false;
                    }
                } catch {
                    continue;
                }
            }

            // No playing player, use first available
            const newPlayer = players[0];
            if (this.currentPlayer !== newPlayer) {
                this.currentPlayer = newPlayer;
                await this.subscribe(); // Resubscribe to new player
                return true;
            }
            return false;
        } catch (err) {
            console.error("Error updating active player:", err);
            return false;
        }
    }

    private async _getPlaybackInfo(canRetry = true): Promise<AudioPlaybackInfo | null> {
        try {
            if (!this.currentPlayer) {
                await this.updateActivePlayer();
                if (!this.currentPlayer) return null;
            }

            const obj = await this.bus.getProxyObject(
                this.currentPlayer,
                "/org/mpris/MediaPlayer2"
            );

            const props = obj.getInterface("org.freedesktop.DBus.Properties");

            const status = await props.Get(
                "org.mpris.MediaPlayer2.Player",
                "PlaybackStatus"
            );

            const metadata = await props.Get(
                "org.mpris.MediaPlayer2.Player",
                "Metadata"
            );

            const artists = metadata.value["xesam:artist"];
            return {
                trackName: metadata.value["xesam:title"] ?? "",
                artistName: Array.isArray(artists) && artists.length > 0 ? artists[0] : undefined,
                albumName: metadata.value["xesam:album"],
                isPlaying: status.value === "Playing",
            };
        } catch (err) {
            console.error("Error getting playback info:", err);
            // Player might have closed, try to find a new one
            if (canRetry) {
                this.currentPlayer = null;
                await this.updateActivePlayer();
                // Retry again but only once
                if (this.currentPlayer) {
                    return this._getPlaybackInfo(false);
                }
            }
            return null;
        }
    }

    public async getPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        return this._getPlaybackInfo(true);
    }

    private async subscribe() {
        if (!this.currentPlayer) return;

        try {
            const obj = await this.bus.getProxyObject(
                this.currentPlayer,
                "/org/mpris/MediaPlayer2"
            );

            const props = obj.getInterface("org.freedesktop.DBus.Properties");

            props.on(
                "PropertiesChanged",
                async (_iface, _changed) => {
                    try {
                        // Check if another player started playing
                        await this.updateActivePlayer();
                        const info = await this.getPlaybackInfo();
                        this.onChange(info);
                    } catch (err) {
                        // Player may have closed, notify with null
                        this.currentPlayer = null;
                        await this.updateActivePlayer();
                        this.onChange(null);
                    }
                }
            );
        } catch (err) {
            console.error("Error subscribing to player:", err);
        }
    }

    private async getFirstPlayer() {
        if (!this.currentPlayer) {
            await this.updateActivePlayer();
            if (!this.currentPlayer) return;
        }

        try {
            const obj = await this.bus.getProxyObject(
                this.currentPlayer,
                "/org/mpris/MediaPlayer2"
            );

            const player = obj.getInterface("org.mpris.MediaPlayer2.Player");
            return player;
        } catch (err) {
            // Player is invalid, try to find a new one
            this.currentPlayer = null;
            await this.updateActivePlayer();
            return;
        }
    }

    async play(): Promise<void> {
        const player = await this.getFirstPlayer();
        if (player) {
            await player.Play();
            await this.refreshState();
        }
    }

    async pause(): Promise<void> {
        const player = await this.getFirstPlayer();
        if (player) {
            await player.Pause();
            await this.refreshState();
        }
    }

    async next(): Promise<void> {
        const player = await this.getFirstPlayer();
        if (player) {
            await player.Next();
            await this.refreshState();
        }
    }

    async previous(): Promise<void> {
        const player = await this.getFirstPlayer();
        if (player) {
            await player.Previous();
            await this.refreshState();
        }
    }

    private async refreshState(): Promise<void> {
        // D-Bus events are usually instant, but add small delay to be safe
        await new Promise(resolve => setTimeout(resolve, 50));
        const info = await this.getPlaybackInfo();
        this.onChange(info);
    }
}
