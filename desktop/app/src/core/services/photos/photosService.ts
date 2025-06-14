import { PhotoLibrary } from "./photoLibrary";
import { PhotoLibraryLocation, PhotoLibraryDetails } from "../../models";
import { getDefaultDirectoriesCached } from "../../utils/deviceInfo";
import fs from "fs";
import { envConfig } from "../../envConfig";

export default class PhotosService {

  private static instance: PhotosService;

  static getInstance() {
    if (!PhotosService.instance) {
      throw new Error("PhotosService not initialized");
    }
    return PhotosService.instance;
  }

  static async start() {
    if (PhotosService.instance) {
      throw new Error("PhotosService already initialized");
    }
    PhotosService.instance = new PhotosService();
    const locations = await PhotoLibraryLocation.getLocations();
    if (locations.length === 0) {
      locations.push(await PhotosService.instance.createFirstLibrary());
    }

    const promises = locations.map(async (rec) => {
      const lib = new PhotoLibrary(rec.location);
      try {
        await lib.mount();

        PhotosService.instance.libraries[rec.id] = {
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

  private async checkLocationAccess(location: string): Promise<boolean> {
    try {
      await fs.promises.access(location);
      return true;
    } catch (e) {
      return false;
    }
  }

  private async createFirstLibrary(): Promise<PhotoLibraryLocation> {
    const defaultDirs = getDefaultDirectoriesCached();
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
        location = envConfig.USER_HOME_DIR;
        name = 'Home';
      }
    }
    return PhotoLibraryLocation.addLocation(name, location);
  }

  static async stop() {
    if (!PhotosService.instance) {
      return;
    }
    const libs = Object.keys(PhotosService.instance.libraries).map((key) => parseInt(key));
    const promises = libs.map((key) => {
      return PhotosService.instance.libraries[key].lib.eject();
    });
    await Promise.allSettled(promises);
    PhotosService.instance = null;
  }

  private libraries: { [key: number]: { name: string; location: string; lib: PhotoLibrary } } = {};

  getLibrary(id: number): PhotoLibrary {
    return this.libraries[id].lib;
  }

  getLibraries(): PhotoLibraryDetails[] {
    return Object.keys(this.libraries).map((key) => {
      return {
        id: parseInt(key),
        name: this.libraries[key].name,
        location: this.libraries[key].location,
      };
    });
  }

  async addLibrary(name: string, location: string): Promise<PhotoLibraryDetails> {
    if (!(await this.checkLocationAccess(location))) {
      throw new Error('Location not accessible');
    }
    const rec = await PhotoLibraryLocation.addLocation(name, location);

    if (!this.libraries[rec.id]) {
      const lib = new PhotoLibrary(location);
      lib.mount();

      this.libraries[rec.id] = {
        name,
        location,
        lib,
      };
    }
    return rec.details();
  }

  async removeLibrary(id: number) {
    await PhotoLibraryLocation.removeLocation(id);
    this.getLibrary(id).eject();
    delete this.libraries[id];
  }
}
