import { serviceStartMethod, serviceStopMethod, exposed } from "shared/services/primatives";
import { DeletePhotosResponse, GetPhotosParams, Photo, PhotoLibraryLocation } from "shared/types";
import { PhotoLibrary } from "./photoLibrary";
import { PhotosService } from "shared/services/photosService";
import fs from "fs";
import os from "os";

export abstract class DesktopPhotosService extends PhotosService {

    private libraries: { [key: string]: { name: string; location: string; lib: PhotoLibrary } } = {};

    private async createFirstLibrary(): Promise<PhotoLibraryLocation> {
        const localSc = modules.getLocalServiceController();
        const defaultDirs = await localSc.system.getDefaultDirectories();
        let name = 'Pictures';
        let location = defaultDirs.Pictures;
        // check if the default location is accessible
        if (!(await this.checkLocationAccess(location))) {
            if (await this.checkLocationAccess(defaultDirs.Desktop)) {
                location = defaultDirs.Desktop;
                name = 'Desktop';
            } else if (await this.checkLocationAccess(defaultDirs.Documents)) {
                location = defaultDirs.Documents;
                name = 'Documents';
            } else if (await this.checkLocationAccess(defaultDirs.Downloads)) {
                location = defaultDirs.Downloads;
                name = 'Downloads';
            } else {
                location = os.homedir();
                name = 'Home';
            }
        }
        return this.addLocation(name, location);
    }

    getLibrary(id: string): PhotoLibrary | undefined {
        return this.libraries[id]?.lib;
    }

    getLibraryStrict(id: string): PhotoLibrary {
        const lib = this.getLibrary(id);
        if (!lib) {
            throw new Error(`Library with ID "${id}" not found.`);
        }
        return lib;
    }

    private async checkLocationAccess(location: string): Promise<boolean> {
        try {
            await fs.promises.access(location);
            return true;
        } catch (e) {
            return false;
        }
    }

    protected async _allowLocationAdd(location: PhotoLibraryLocation): Promise<boolean> {
        // validate id location path is valid
        return this.checkLocationAccess(location.location);
    }

    protected async _onLocationAdd(phLocation: PhotoLibraryLocation): Promise<void> {
        if (!this.libraries[phLocation.id]) {
            const lib = new PhotoLibrary(phLocation.location);
            lib.mount();

            this.libraries[phLocation.id] = {
                name: phLocation.name,
                location: phLocation.location,
                lib,
            };
        }
    }

    protected async _onLocationRemove(phLocation: PhotoLibraryLocation): Promise<void> {
        this.getLibrary(phLocation.id)?.eject();
        delete this.libraries[phLocation.id];
    }

    @exposed
    public async deletePhotos(libraryId: string, ids: number[]): Promise<DeletePhotosResponse> {
        const lib = this.getLibraryStrict(libraryId);
        return lib.deletePhotos(ids);
    }

    @exposed
    public async getPhotos(libraryId: string, params: GetPhotosParams): Promise<Photo[]> {
        const lib = this.getLibraryStrict(libraryId);
        return lib.getPhotos(params);
    }

    @exposed
    public async getPhoto(libraryId: string, photoId: number): Promise<Photo | null> {
        const lib = this.getLibraryStrict(libraryId);
        return lib.getPhoto(photoId);
    }

    @serviceStartMethod
    public async start() {
        const locations = await this.getLocations();
        if (locations.length === 0) {
            locations.push(await this.createFirstLibrary());
        }

        const promises = locations.map(async (rec) => {
            const lib = new PhotoLibrary(rec.location);
            try {
                await lib.mount();

                this.libraries[rec.id] = {
                    name: rec.name,
                    location: rec.location,
                    lib,
                };
            } catch (e) {
                console.error(`Failed to mount library ${rec.name} at ${rec.location}:`, e);
                return;
            }
        });

        await Promise.allSettled(promises);
    }

    @serviceStopMethod
    public async stop() {
        const libs = Object.keys(this.libraries);
        const promises = libs.map((key) => {
            return this.libraries[key].lib.eject();
        });
        await Promise.allSettled(promises);
    }
}
