import { execFile } from "child_process";
import { AudioPlaybackInfo } from "shared/types";

type StateCallback = (info: AudioPlaybackInfo | null) => void;

// Single script that checks Spotify → Music → QuickTime in one osascript invocation
const FETCH_SCRIPT = `
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
        return "spotify||" & pState & "||" & tName & "||" & tArtist & "||" & tAlbum
      end if
    end tell
  end if
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
        return "music||" & pState & "||" & tName & "||" & tArtist & "||" & tAlbum
      end if
    end tell
  end if
  if exists process "QuickTime Player" then
    tell application "QuickTime Player"
      if (count of documents) > 0 then
        tell front document
          set isPlaying to playing
          set docName to name
          return "quicktime||" & (isPlaying as string) & "||" & docName
        end tell
      end if
    end tell
  end if
end tell
return "none"
`;

type PlayerSource = 'spotify' | 'music' | 'quicktime';

const PLAYER_COMMANDS: Record<PlayerSource, { play: string; pause: string; next: string; previous: string }> = {
    spotify: {
        play: 'tell application "Spotify" to play',
        pause: 'tell application "Spotify" to pause',
        next: 'tell application "Spotify" to next track',
        previous: 'tell application "Spotify" to previous track',
    },
    music: {
        play: 'tell application "Music" to play',
        pause: 'tell application "Music" to pause',
        next: 'tell application "Music" to next track',
        previous: 'tell application "Music" to previous track',
    },
    quicktime: {
        play: 'tell application "QuickTime Player" to tell front document to play',
        pause: 'tell application "QuickTime Player" to tell front document to pause',
        next: 'tell application "QuickTime Player" to tell front document to step forward',
        previous: 'tell application "QuickTime Player" to tell front document to step backward',
    },
};

function runAppleScript(script: string, timeoutMs = 3000): Promise<string | null> {
    return new Promise((resolve) => {
        const lines = script.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const args: string[] = [];
        for (const line of lines) {
            args.push('-e', line);
        }
        execFile('osascript', args, { timeout: timeoutMs }, (err, stdout) => {
            if (err) return resolve(null);
            const out = stdout.trim();
            resolve(out.length ? out : null);
        });
    });
}

interface FetchResult {
    source: PlayerSource;
    info: AudioPlaybackInfo;
}

function parseFetchResult(res: string | null): FetchResult | null {
    if (!res || res === 'none') return null;
    const parts = res.split('||');
    const source = parts[0] as string;
    if (source === 'spotify' || source === 'music') {
        return {
            source,
            info: {
                trackName: parts[2] || '',
                artistName: parts[3] || '',
                albumName: parts[4] || '',
                isPlaying: parts[1] === 'playing',
            },
        };
    }
    if (source === 'quicktime') {
        return {
            source,
            info: {
                trackName: parts[2] || '',
                artistName: undefined,
                albumName: undefined,
                isPlaying: parts[1] === 'true',
            },
        };
    }
    return null;
}

export class MacOSPlaybackWatcher {
    private onChange: StateCallback;
    private pollTimer: NodeJS.Timeout | null = null;
    private lastInfo: AudioPlaybackInfo | null = null;
    private lastGetCallTs = 0;
    private polling = false;
    private activeSource: PlayerSource | null = null;

    private readonly POLL_INTERVAL = 3000;
    private readonly IDLE_TIMEOUT = 2 * 60 * 1000;

    constructor(onStateChange: StateCallback) {
        this.onChange = onStateChange;
    }

    async getPlaybackInfo(): Promise<AudioPlaybackInfo | null> {
        this.lastGetCallTs = Date.now();
        if (this.pollTimer && this.lastInfo) {
            return this.lastInfo;
        }
        if (!this.pollTimer) this.startPolling();
        const result = parseFetchResult(await runAppleScript(FETCH_SCRIPT));
        this.activeSource = result?.source ?? null;
        this.lastInfo = result?.info ?? null;
        return this.lastInfo;
    }

    async play(): Promise<void> {
        await this.sendCommand('play');
    }

    async pause(): Promise<void> {
        await this.sendCommand('pause');
    }

    async next(): Promise<void> {
        await this.sendCommand('next');
    }

    async previous(): Promise<void> {
        await this.sendCommand('previous');
    }

    private async sendCommand(action: 'play' | 'pause' | 'next' | 'previous'): Promise<void> {
        // If we don't know the active player, fetch first
        if (!this.activeSource) {
            console.debug('[MediaControl] Active player source unknown, fetching before sending command');
            const result = parseFetchResult(await runAppleScript(FETCH_SCRIPT));
            this.activeSource = result?.source ?? null;
        }
        if (!this.activeSource) return;
        const cmd = PLAYER_COMMANDS[this.activeSource][action];
        await runAppleScript(cmd);

        // Optimistically update state based on the action to avoid
        // the "not playing" flash while the player settles
        if (this.lastInfo) {
            const optimistic = { ...this.lastInfo };
            if (action === 'play') optimistic.isPlaying = true;
            else if (action === 'pause') optimistic.isPlaying = false;
            this.publishIfChanged(optimistic);
        }
    }

    private startPolling() {
        this.pollTimer = setInterval(async () => {
            if (Date.now() - this.lastGetCallTs > this.IDLE_TIMEOUT) {
                this.stopPolling();
                return;
            }
            if (this.polling) return;
            this.polling = true;
            try {
                const result = parseFetchResult(await runAppleScript(FETCH_SCRIPT));
                this.activeSource = result?.source ?? null;
                if (!result) {
                    this.stopPolling();
                    this.publishIfChanged(null);
                    return;
                }
                this.publishIfChanged(result.info);
            } finally {
                this.polling = false;
            }
        }, this.POLL_INTERVAL);
    }

    private stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            this.lastInfo = null;
        }
    }

    private publishIfChanged(info: AudioPlaybackInfo | null) {
        const prev = this.lastInfo;
        if (prev === info) return;
        if (prev && info
            && prev.trackName === info.trackName
            && prev.artistName === info.artistName
            && prev.albumName === info.albumName
            && prev.isPlaying === info.isPlaying) return;
        this.lastInfo = info;
        this.onChange(info);
    }
}
