import volumeDriverLinux from './linux'
import volumeDriverWin32 from './win32'
import volumeDriverMac from './mac';
import { VolumeDriver } from '../../../types'

const platform = process.platform;

let volumeDriver: VolumeDriver;

if (platform === 'win32') {
    volumeDriver = volumeDriverWin32;
} else if (platform === 'darwin') {
    volumeDriver = volumeDriverMac;
} else {
    volumeDriver = volumeDriverLinux;
}

export default volumeDriver;
