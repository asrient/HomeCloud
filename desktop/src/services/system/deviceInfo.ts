import { DeviceFormType, DeviceInfo, OSType, DefaultDirectories } from "shared/types";
import os from "os";
import path from "path";
import { app } from "electron";

export function getDefaultDirectories(): DefaultDirectories {
    const directories: DefaultDirectories = {
        Pictures: null,
        Documents: null,
        Downloads: null,
        Videos: null,
        Movies: null,
        Music: null,
        Desktop: null,
    };

    // Use Electron's app.getPath() for standard directories
    directories.Documents = app.getPath('documents');
    directories.Downloads = app.getPath('downloads');
    directories.Pictures = app.getPath('pictures');
    directories.Music = app.getPath('music');
    directories.Videos = app.getPath('videos');
    directories.Desktop = app.getPath('desktop');

    // For Movies directory, fallback to Videos or manual path
    if (os.platform() === 'darwin') {
        // On macOS, Movies is typically separate from Videos
        directories.Movies = path.join(os.homedir(), 'Movies');
    } else {
        // On Windows/Linux, Movies typically equals Videos
        directories.Movies = directories.Videos;
    }
    return directories;
}

let _defaultDirectories: DefaultDirectories | null = null;
export function getDefaultDirectoriesCached(): DefaultDirectories {
    if (!_defaultDirectories) {
        _defaultDirectories = getDefaultDirectories();
    }
    return _defaultDirectories;
}
