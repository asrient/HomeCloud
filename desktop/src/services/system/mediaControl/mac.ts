import { exec } from "child_process";
import { AudioPlaybackInfo } from "shared/types";

type StateCallback = (info: AudioPlaybackInfo | null) => void;

export class MacOSPlaybackWatcher {
    private onChange: StateCallback;
    private pollTimer: NodeJS.Timeout | null = null;
    private lastInfo: AudioPlaybackInfo | null = null;
    private lastGetCallTs = 0;

    private readonly POLL_INTERVAL = 5000;
    private readonly IDLE_TIMEOUT = 2 * 60 * 1000;

    constructor(onStateChange: StateCallback) {
        this.onChange = onStateChange;
    }

    /** Public API */
    async getPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        this.lastGetCallTs = Date.now();

        if (!this.pollTimer) {
            this.startPolling();
        }

        const info = await this.fetchPlaybackInfo();
        return info;
    }

    async play(): Promise<void> {
        await this.executePlayerCommand('play');
        await this.refreshState();
    }

    async pause(): Promise<void> {
        await this.executePlayerCommand('pause');
        await this.refreshState();
    }

    async next(): Promise<void> {
        await this.executePlayerCommand('next track');
        await this.refreshState();
    }

    async previous(): Promise<void> {
        await this.executePlayerCommand('previous track');
        await this.refreshState();
    }

    /** ---------------- Internals ---------------- */

    private async executePlayerCommand(command: string): Promise<void> {
        // Try Spotify first
        const spotifyScript = `
tell application "System Events"
  if exists process "Spotify" then
    tell application "Spotify" to ${command}
    return "ok"
  end if
end tell
        `;

        const spotifyResult = await this.execAppleScript(spotifyScript);
        if (spotifyResult === 'ok') return;

        // Try Apple Music
        const musicScript = `
tell application "System Events"
  if exists process "Music" then
    tell application "Music" to ${command}
    return "ok"
  end if
end tell
        `;

        await this.execAppleScript(musicScript);
    }

    private async refreshState(): Promise<void> {
        // Wait a bit for the player to update
        await new Promise(resolve => setTimeout(resolve, 100));
        const info = await this.fetchPlaybackInfo();
        this.publishIfChanged(info);
    }

    private startPolling() {
        this.pollTimer = setInterval(async () => {
            // Stop if idle
            if (Date.now() - this.lastGetCallTs > this.IDLE_TIMEOUT) {
                this.stopPolling();
                return;
            }

            const info = await this.fetchPlaybackInfo();

            // Stop if nothing is open anymore
            if (!info) {
                this.stopPolling();
                this.publishIfChanged(null);
                return;
            }

            this.publishIfChanged(info);
        }, this.POLL_INTERVAL);
    }

    private stopPolling() {
        if (this.pollTimer) {
            console.log('Stopping MacOSPlaybackWatcher polling due to inactivity');
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            this.lastInfo = null;
        }
    }

    private publishIfChanged(info: AudioPlaybackInfo | null) {
        if (!this.isSame(this.lastInfo, info)) {
            this.lastInfo = info;
            this.onChange(info);
        }
    }

    private isSame(
        a: AudioPlaybackInfo | null,
        b: AudioPlaybackInfo | null
    ): boolean {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    /** ---------------- Data Fetch ---------------- */

    private async fetchPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        // Priority order: Spotify → Apple Music
        const spotify = await this.querySpotify();
        if (spotify) return spotify;

        const music = await this.queryAppleMusic();
        if (music) return music;

        return null;
    }

    private execAppleScript(script: string): Promise<string | null> {
        return new Promise((resolve) => {
            // Split script into lines and build command with multiple -e flags
            const lines = script
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            // Build command with one -e flag per line
            const eFlags = lines
                .map(line => `-e '${line.replace(/'/g, "'\"'\"'")}'`)
                .join(' ');

            const cmd = `osascript ${eFlags}`;
            exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    console.error('AppleScript error:', err.message);
                    console.error('stderr:', stderr);
                    return resolve(null);
                }
                const out = stdout.trim();
                resolve(out.length ? out : null);
            });
        });
    }

    /** ---------------- Spotify ---------------- */

    private async querySpotify(): Promise<AudioPlaybackInfo | null> {
        const script = `
tell application "System Events"
  if exists process "Spotify" then
    tell application "Spotify"
      if player state is playing or player state is paused then
        return (player state as string) & "||" & name of current track & "||" & artist of current track & "||" & album of current track
      end if
    end tell
  end if
end tell
    `;

        const res = await this.execAppleScript(script);
        // console.log('Spotify AppleScript result:', res);
        if (!res) return null;

        const [state, track, artist, album] = res.split("||");

        return {
            trackName: track,
            artistName: artist,
            albumName: album,
            isPlaying: state === "playing",
        };
    }

    /** ---------------- Apple Music ---------------- */

    private async queryAppleMusic(): Promise<AudioPlaybackInfo | null> {
        const script = `
tell application "System Events"
  if exists process "Music" then
    tell application "Music"
      if player state is playing or player state is paused then
        return (player state as string) & "||" & name of current track & "||" & artist of current track & "||" & album of current track
      end if
    end tell
  end if
end tell
    `;

        const res = await this.execAppleScript(script);
        // console.log('Apple Music AppleScript result:', res);
        if (!res) return null;

        const [state, track, artist, album] = res.split("||");

        return {
            trackName: track,
            artistName: artist,
            albumName: album,
            isPlaying: state === "playing",
        };
    }
}
