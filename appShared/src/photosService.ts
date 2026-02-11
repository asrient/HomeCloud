import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./servicePrimatives";
import { DeletePhotosResponse, GetPhotosParams, GetPhotosResponse, Photo, PhotoLibraryLocation, SignalEvent, StoreNames } from "./types";
import ConfigStorage from "./storage";
import Signal from "./signals";


export abstract class PhotosService extends Service {
    protected store: ConfigStorage;

    protected PH_LIBS_KEY = "libraries";

    public locationsSignal = new Signal<[SignalEvent, PhotoLibraryLocation]>({ isExposed: true, isAllowAll: false });

    public async init() {
        this._init();
        this.store = modules.ConfigStorage.getInstance(StoreNames.PHOTOS);
        await this.store.load();
    }

    @exposed
    async getLocations(): Promise<PhotoLibraryLocation[]> {
        const locations = this.store.getItem<PhotoLibraryLocation[]>(this.PH_LIBS_KEY);
        return locations || [];
    }

    @exposed
    async getLocation(id: string): Promise<PhotoLibraryLocation | null> {
        const locations = await this.getLocations();
        const location = locations.find(loc => loc.id === id);
        if (!location) {
            return null;
        }
        return location;
    }

    protected async _allowLocationAdd(location: PhotoLibraryLocation): Promise<boolean> {
        // This method can be overridden by subclasses to implement custom logic for allowing location addition
        return true; // Default behavior allows all locations
    }

    protected async _allowLocationRemove(location: PhotoLibraryLocation): Promise<boolean> {
        // This method can be overridden by subclasses to implement custom logic for allowing location removal
        return true; // Default behavior allows all locations to be removed
    }

    protected async _onLocationAdd(location: PhotoLibraryLocation): Promise<void> {
        // This method can be overridden by subclasses to handle additional logic when a location is added
    }

    protected async _onLocationRemove(location: PhotoLibraryLocation): Promise<void> {
        // This method can be overridden by subclasses to handle additional logic when a location is removed
    }

    @exposed
    async addLocation(name: string, location: string): Promise<PhotoLibraryLocation> {
        const locations = this.store.getItem<PhotoLibraryLocation[]>(this.PH_LIBS_KEY) || [];
        // make sure the location is not already added
        const existingLocation = locations.find(loc => loc.location === location);
        if (existingLocation) {
            throw new Error(`Location "${location}" is already added.`);
        }
        const newLocation: PhotoLibraryLocation = { id: modules.crypto.uuid(), name, location };
        // Check if the location can be added
        const canAdd = await this._allowLocationAdd(newLocation);
        if (!canAdd) {
            throw new Error(`Location "${location}" cannot be added.`);
        }
        locations.push(newLocation);
        this.store.setItem(this.PH_LIBS_KEY, locations);
        await this._onLocationAdd(newLocation);
        this.locationsSignal.dispatch(SignalEvent.ADD, newLocation);
        return newLocation;
    }

    @exposed
    async removeLocation(id: string): Promise<void> {
        const locations = this.store.getItem<PhotoLibraryLocation[]>(this.PH_LIBS_KEY) || [];
        const locationToRemove = locations.find(loc => loc.id === id);
        if (!locationToRemove) {
            throw new Error(`Location with ID "${id}" not found.`);
        }
        const canRemove = await this._allowLocationRemove(locationToRemove);
        if (!canRemove) {
            throw new Error(`Location "${locationToRemove.name}" cannot be removed.`);
        }
        const updatedLocations = locations.filter(loc => loc.id !== id);
        this.store.setItem(this.PH_LIBS_KEY, updatedLocations);
        await this._onLocationRemove(locationToRemove);
        this.locationsSignal.dispatch(SignalEvent.REMOVE, locationToRemove);
    }

    @exposed
    public async deletePhotos(libraryId: string, ids: string[]): Promise<DeletePhotosResponse> {
        throw new Error("deletePhotos not implemented");
    }

    @exposed
    public async getPhotos(libraryId: string, params: GetPhotosParams): Promise<GetPhotosResponse> {
        throw new Error("getPhotos not implemented");
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
