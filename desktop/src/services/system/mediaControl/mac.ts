import { exec } from "child_process";
import { AudioPlaybackInfo } from "shared/types";

type StateCallback = (info: AudioPlaybackInfo | null) => void;

export class MacOSPlaybackWatcher {
    private onChange: StateCallback;
    private pollTimer: NodeJS.Timeout | null = null;
    private lastInfo: AudioPlaybackInfo | null = null;
    private lastGetCallTs = 0;
    private polling = false; // guard against overlapping polls

    // Per-player error tracking: skip a player temporarily after repeated timeouts
    private playerErrors: Record<string, number> = {};
    private playerBackoffUntil: Record<string, number> = {};

    private readonly POLL_INTERVAL = 3000;
    private readonly IDLE_TIMEOUT = 2 * 60 * 1000;
    private readonly EXEC_TIMEOUT_MS = 5000; // kill osascript after 5 seconds
    private readonly MAX_ERRORS_BEFORE_BACKOFF = 2;
    private readonly BACKOFF_DURATION_MS = 30_000; // skip player for 30s after repeated failures

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

        const musicResult = await this.execAppleScript(musicScript);
        if (musicResult === 'ok') return;

        // Try QuickTime Player
        const qtCommand = this.mapToQuickTimeCommand(command);
        if (qtCommand) {
            const quickTimeScript = `
tell application "System Events"
  if exists process "QuickTime Player" then
    tell application "QuickTime Player"
      if (count of documents) > 0 then
        tell front document to ${qtCommand}
        return "ok"
      end if
    end tell
  end if
end tell
            `;

            await this.execAppleScript(quickTimeScript);
        }
    }

    private mapToQuickTimeCommand(command: string): string | null {
        // QuickTime uses different command syntax
        switch (command) {
            case 'play':
                return 'play';
            case 'pause':
                return 'pause';
            case 'next track':
                return 'step forward';
            case 'previous track':
                return 'step backward';
            default:
                return null;
        }
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

            // Skip if a previous poll is still in-flight
            if (this.polling) return;
            this.polling = true;

            try {
                const info = await this.fetchPlaybackInfo();

                // Stop if nothing is open anymore
                if (!info) {
                    this.stopPolling();
                    this.publishIfChanged(null);
                    return;
                }

                this.publishIfChanged(info);
            } finally {
                this.polling = false;
            }
        }, this.POLL_INTERVAL);
    }

    private stopPolling() {
        if (this.pollTimer) {
            // console.log('Stopping MacOSPlaybackWatcher polling due to inactivity');
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
        // Priority order: Spotify → Apple Music → QuickTime Player
        const spotify = await this.querySpotify();
        if (spotify) return spotify;

        const music = await this.queryAppleMusic();
        if (music) return music;

        const quicktime = await this.queryQuickTime();
        if (quicktime) return quicktime;

        return null;
    }

    private execAppleScript(script: string, playerName?: string): Promise<string | null> {
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
            const child = exec(cmd, { timeout: this.EXEC_TIMEOUT_MS }, (err, stdout, stderr) => {
                if (err) {
                    // Only log if not a timeout we already expect
                    const isTimeout = stderr?.includes('-1712') || err.killed;
                    if (isTimeout && playerName) {
                        this.recordPlayerError(playerName);
                    }
                    if (!isTimeout) {
                        console.error('AppleScript error:', err.message);
                    }
                    return resolve(null);
                }
                // Clear error count on success
                if (playerName) {
                    this.playerErrors[playerName] = 0;
                }
                const out = stdout.trim();
                resolve(out.length ? out : null);
            });
        });
    }

    private recordPlayerError(player: string) {
        this.playerErrors[player] = (this.playerErrors[player] || 0) + 1;
        if (this.playerErrors[player] >= this.MAX_ERRORS_BEFORE_BACKOFF) {
            this.playerBackoffUntil[player] = Date.now() + this.BACKOFF_DURATION_MS;
            this.playerErrors[player] = 0;
        }
    }

    private isPlayerBackedOff(player: string): boolean {
        const until = this.playerBackoffUntil[player];
        if (!until) return false;
        if (Date.now() >= until) {
            delete this.playerBackoffUntil[player];
            return false;
        }
        return true;
    }

    /** ---------------- Spotify ---------------- */

    private async querySpotify(): Promise<AudioPlaybackInfo | null> {
        if (this.isPlayerBackedOff('Spotify')) return null;

        const script = `
tell application "System Events"
  if exists process "Spotify" then
    tell application "Spotify"
      if player state is playing or player state is paused then
        set pState to (player state as string)
        try
          set tName to name of current track as text
        on error
          set tName to ""
        end try
        try
          set tArtist to artist of current track as text
        on error
          set tArtist to ""
        end try
        try
          set tAlbum to album of current track as text
        on error
          set tAlbum to ""
        end try
        return pState & "||" & tName & "||" & tArtist & "||" & tAlbum
      end if
    end tell
  end if
end tell
    `;

        const res = await this.execAppleScript(script, 'Spotify');
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
        if (this.isPlayerBackedOff('Music')) return null;

        const script = `
tell application "System Events"
  if exists process "Music" then
    tell application "Music"
      if player state is playing or player state is paused then
        set pState to (player state as string)
        try
          set tName to name of current track as text
        on error
          set tName to ""
        end try
        try
          set tArtist to artist of current track as text
        on error
          set tArtist to ""
        end try
        try
          set tAlbum to album of current track as text
        on error
          set tAlbum to ""
        end try
        return pState & "||" & tName & "||" & tArtist & "||" & tAlbum
      end if
    end tell
  end if
end tell
    `;

        const res = await this.execAppleScript(script, 'Music');
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

    /** ---------------- QuickTime Player ---------------- */

    private async queryQuickTime(): Promise<AudioPlaybackInfo | null> {
        if (this.isPlayerBackedOff('QuickTime Player')) return null;

        const script = `
tell application "System Events"
  if exists process "QuickTime Player" then
    tell application "QuickTime Player"
      if (count of documents) > 0 then
        tell front document
          set isPlaying to playing
          set docName to name
          return (isPlaying as string) & "||" & docName
        end tell
      end if
    end tell
  end if
end tell
    `;

        const res = await this.execAppleScript(script, 'QuickTime Player');
        // console.log('QuickTime AppleScript result:', res);
        if (!res) return null;

        const [playing, docName] = res.split("||");

        return {
            trackName: docName,
            artistName: undefined,
            albumName: undefined,
            isPlaying: playing === "true",
        };
    }
}
