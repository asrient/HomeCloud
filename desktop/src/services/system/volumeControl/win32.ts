import { VolumeDriver } from '../../../types'

let volumeMixer;

// Installed as optional dependency since install fails on non-Windows platforms
try {
    volumeMixer = require('node-audio-volume-mixer');
} catch (e) {
    // Module not available on this platform
    console.log('Volume mixer not available on this platform');
}

function assetModuleAvailable() {
    if (!volumeMixer) {
        throw new Error('Volume mixer module not available on this platform');
    }
}

async function getVolume(): Promise<number> {
    assetModuleAvailable();
    return volumeMixer.getMasterVolumeLevelScalar();
}

async function setVolume(val: number): Promise<void> {
    assetModuleAvailable();
    volumeMixer.setMasterVolume(val);
}

async function getMuted(): Promise<boolean> {
    assetModuleAvailable();
    return volumeMixer.isMasterMuted();
}

async function setMuted(val: boolean): Promise<void> {
    assetModuleAvailable();
    volumeMixer.muteMaster(val);
}

const volumeDriverWin32: VolumeDriver = {
    getVolume,
    setVolume,
    getMuted,
    setMuted,
}

export default volumeDriverWin32;
