import { Service, serviceStartMethod, serviceStopMethod, exposed, info, input, output, assertServiceRunning, wfApi } from "./servicePrimatives";
import { Sch, DeletePhotosResponse, DeletePhotosResponseSchema, GetPhotosParams, GetPhotosParamsSchema, GetPhotosResponse, GetPhotosResponseSchema, Photo, PhotoLibraryLocation, PhotoLibraryLocationSchema, SignalEvent, StoreNames } from "./types";
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

    // --- Exposed methods (final — do not override) ---

    @exposed @info("List registered photo library locations")
    @wfApi
    @output(Sch.Array(PhotoLibraryLocationSchema))
    async getLocations(): Promise<PhotoLibraryLocation[]> { return this._getLocations(); }

    @exposed @info("Get a photo library location by ID")
    @input(Sch.String)
    @output(Sch.Nullable(PhotoLibraryLocationSchema))
    @wfApi
    async getLocation(id: string): Promise<PhotoLibraryLocation | null> { return this._getLocation(id); }

    @exposed @info("Register a new photo library location")
    @wfApi
    @input(Sch.String, Sch.String)
    @output(PhotoLibraryLocationSchema)
    async addLocation(name: string, location: string): Promise<PhotoLibraryLocation> { return this._addLocation(name, location); }

    @exposed @info("Remove a photo library location")
    @wfApi
    @input(Sch.String)
    async removeLocation(id: string): Promise<void> { return this._removeLocation(id); }

    @exposed @info("Delete photos from a library")
    @wfApi
    @input(Sch.String, Sch.StringArray)
    @output(DeletePhotosResponseSchema)
    public async deletePhotos(libraryId: string, ids: string[]): Promise<DeletePhotosResponse> { return this._deletePhotos(libraryId, ids); }

    @exposed @info("Get photos from a library with pagination")
    @wfApi
    @input(Sch.String, GetPhotosParamsSchema)
    @output(GetPhotosResponseSchema)
    public async getPhotos(libraryId: string, params: GetPhotosParams): Promise<GetPhotosResponse> { return this._getPhotos(libraryId, params); }

    // --- Protected methods (override these in subclasses) ---

    protected async _getLocations(): Promise<PhotoLibraryLocation[]> {
        return this.store.getItem<PhotoLibraryLocation[]>(this.PH_LIBS_KEY) || [];
    }

    protected async _getLocation(id: string): Promise<PhotoLibraryLocation | null> {
        const locations = await this._getLocations();
        return locations.find(loc => loc.id === id) || null;
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

    protected async _addLocation(name: string, location: string): Promise<PhotoLibraryLocation> {
        const locations = this.store.getItem<PhotoLibraryLocation[]>(this.PH_LIBS_KEY) || [];
        const existingLocation = locations.find(loc => loc.location === location);
        if (existingLocation) {
            throw new Error(`Location "${location}" is already added.`);
        }
        const newLocation: PhotoLibraryLocation = { id: modules.crypto.uuid(), name, location };
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

    protected async _removeLocation(id: string): Promise<void> {
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

    protected async _deletePhotos(libraryId: string, ids: string[]): Promise<DeletePhotosResponse> {
        throw new Error("deletePhotos not implemented");
    }

    protected async _getPhotos(libraryId: string, params: GetPhotosParams): Promise<GetPhotosResponse> {
        throw new Error("getPhotos not implemented");
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
