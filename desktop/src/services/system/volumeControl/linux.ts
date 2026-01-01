import { execa } from 'execa'
import { VolumeDriver } from '../../../types';

export interface VolumeInfo {
    volume: number
    muted: boolean
}

async function amixer(...args: string[]): Promise<string> {
    const result = await execa('amixer', args)
    return result.stdout
}

let defaultDeviceCache: string | null = null
const reDefaultDevice = /Simple mixer control '([a-z0-9 -]+)',[0-9]+/i

function parseDefaultDevice(data: string): string {
    const result = reDefaultDevice.exec(data)

    if (result === null) {
        throw new Error('Alsa Mixer Error: failed to parse output')
    }

    return result[1]
}

async function getDefaultDevice(): Promise<string> {
    if (defaultDeviceCache) return defaultDeviceCache

    return (defaultDeviceCache = parseDefaultDevice(await amixer()))
}

const reInfo = /[a-z][a-z ]*: Playback [0-9-]+ \[([0-9]+)%\] (?:[[0-9.-]+dB\] )?\[(on|off)\]/i

function parseInfo(data: string): VolumeInfo {
    const result = reInfo.exec(data)

    if (result === null) {
        throw new Error('Alsa Mixer Error: failed to parse output')
    }

    return { volume: parseInt(result[1], 10), muted: (result[2] === 'off') }
}

async function getInfo(): Promise<VolumeInfo> {
    return parseInfo(await amixer('get', await getDefaultDevice()))
}

async function getVolume(): Promise<number> {
    return (await getInfo()).volume
}

async function setVolume(val: number): Promise<void> {
    await amixer('set', await getDefaultDevice(), val + '%')
}

async function getMuted(): Promise<boolean> {
    return (await getInfo()).muted
}

async function setMuted(val: boolean): Promise<void> {
    await amixer('set', await getDefaultDevice(), val ? 'mute' : 'unmute')
}

const linuxVolumeDriver: VolumeDriver = {
    getVolume,
    setVolume,
    getMuted,
    setMuted,
};

export default linuxVolumeDriver;
