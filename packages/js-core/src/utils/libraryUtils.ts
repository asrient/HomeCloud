import fs from 'fs';
import { envConfig } from '../envConfig';
import path from 'path';

export function getLibraryDirForProfile(profileId: number) {
    if (envConfig.isDesktop()) {
        return envConfig.LIBRARY_DIR;
    }
    return path.join(envConfig.LIBRARY_DIR, profileId.toString());
}

export async function setupLibraryForProfile(profileId: number) {
    const libraryDir = getLibraryDirForProfile(profileId);
    await fs.promises.mkdir(libraryDir, { recursive: true });
    return libraryDir;
}

export enum LibraryLocation {
    LibraryDir = "LIBRARY_DIR",
    PhotosDir = "PHOTOS_DIR",
    NotesDir = "NOTES_DIR",
}

export function getLibraryPath(loc: LibraryLocation, profileId: number) {
    const libraryDir = getLibraryDirForProfile(profileId);
    switch (loc) {
        case LibraryLocation.LibraryDir:
            return libraryDir;
        case LibraryLocation.PhotosDir:
            return path.join(libraryDir, "photos");
        case LibraryLocation.NotesDir:
            return path.join(libraryDir, "notes");
        default:
            throw new Error(`Unknown library location: ${loc}`);
    }
}

//Resolve paths like "<PHOTOS_DIR>/2/mypic.jpg" to the actual path
export function resolveLibraryPath(profileId: number, str: string): string {
    return str.replace(/<([^>]+)>/g, (match, loc) => {
        return getLibraryPath(loc as LibraryLocation, profileId);
    });
}

export function buildLibraryPath(loc: LibraryLocation, ...parts: string[]) {
    return path.join(`<${loc}>`, ...parts);
}
