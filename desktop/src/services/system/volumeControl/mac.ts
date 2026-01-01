import { execa } from 'execa'
import { VolumeDriver } from '../../../types'

async function osascript(cmd: string): Promise<string> {
    const result = await execa('osascript', ['-e', cmd])
    return result.stdout
}

async function getVolume(): Promise<number> {
    const volume = parseInt(await osascript('output volume of (get volume settings)'), 10)
    return volume / 100
}

async function setVolume(val: number): Promise<void> {
    // convert 0-1 range to 0-100
    val = Math.round(val * 100)
    await osascript('set volume output volume ' + val)
}

async function getMuted(): Promise<boolean> {
    return (await osascript('output muted of (get volume settings)')) === 'true'
}

async function setMuted(val: boolean): Promise<void> {
    await osascript('set volume ' + (val ? 'with' : 'without') + ' output muted')
}

const volumeDriverMac: VolumeDriver = {
    getVolume,
    setVolume,
    getMuted,
    setMuted,
}

export default volumeDriverMac;
