import { importModule } from "../../../utils";
import { platform } from "os";

export type AudioPlaybackInfoWin = {
    status: 'playing' | 'paused' | 'stopped' | 'unknown';
    title?: string;
    artist?: string;
    albumTitle?: string;
    position?: number;
    duration?: number;
};

let mediaControlModule: {
    getAudioPlaybackInfo: () => AudioPlaybackInfoWin;
    pauseAudioPlayback: () => void;
    playAudioPlayback: () => void;
    nextAudioTrack: () => void;
    previousAudioTrack: () => void;
    onAudioPlaybackInfoChanged: (callback: (info: AudioPlaybackInfoWin) => void) => void;
}

function getMediaControlModule() {
    if (platform() !== "win32") {
        throw new Error(`Windows Media Control module is not available on ${platform()}`);
    }
    if (!mediaControlModule) {
        mediaControlModule = importModule("MediaControlWin");
    }
    return mediaControlModule;
}

export function getAudioPlaybackInfo() {
    const mediaControl = getMediaControlModule();
    return mediaControl.getAudioPlaybackInfo();
}

export function pauseAudioPlayback() {
    const mediaControl = getMediaControlModule();
    return mediaControl.pauseAudioPlayback();
}

export function playAudioPlayback() {
    const mediaControl = getMediaControlModule();
    return mediaControl.playAudioPlayback();
}

export function nextAudioTrack() {
    const mediaControl = getMediaControlModule();
    return mediaControl.nextAudioTrack();
}

export function previousAudioTrack() {
    const mediaControl = getMediaControlModule();
    return mediaControl.previousAudioTrack();
}

export function onAudioPlaybackInfoChanged(callback: (info: AudioPlaybackInfoWin) => void) {
    const mediaControl = getMediaControlModule();
    mediaControl.onAudioPlaybackInfoChanged(callback);
}
