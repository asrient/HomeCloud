import { exposed } from "shared/services/primatives";
import { DeletePhotosResponse, GetPhotosParams, Photo, PhotoLibraryLocation, GetPhotosResponse } from "shared/types";
import { PhotosService } from "shared/services/photosService";
import * as MediaLibrary from 'expo-media-library';
import mime from 'mime';


export abstract class MobilePhotosService extends PhotosService {

    protected async _allowLocationAdd(location: PhotoLibraryLocation): Promise<boolean> {
        return false;
    }

    protected async _allowLocationRemove(location: PhotoLibraryLocation): Promise<boolean> {
        return false;
    }

    async checkPermissions(request = true): Promise<boolean> {
        const { status } = await MediaLibrary.getPermissionsAsync();
        if (status !== 'granted') {
            if (!request) {
                return false;
            }
            // Request permissions if not granted
            const { status: newStatus } = await MediaLibrary.requestPermissionsAsync();
            return newStatus === 'granted';
        }
        return true;
    }

    async assetToPhoto(asset: MediaLibrary.Asset): Promise<Photo> {
        let uri = asset.uri;
        if (uri.startsWith('ph://')) {
            // Handle photo URI
            const info = await MediaLibrary.getAssetInfoAsync(asset.id);
            uri = info.localUri || uri;
        }
        let mimeType = mime.getType(uri);
        if (!mimeType) {
            if (asset.mediaType === MediaLibrary.MediaType.photo) {
                mimeType = 'image/jpeg'; // Default to JPEG for photos
            }
        }
        const photo: Photo = {
            id: asset.id,
            fileId: uri,
            mimeType: mimeType || '',
            width: asset.width || 0,
            height: asset.height || 0,
            capturedOn: asset.creationTime ? new Date(asset.creationTime) : new Date(0),
            addedOn: asset.modificationTime ? new Date(asset.modificationTime) : new Date(0),
            duration: asset.duration || 0,
        };
        return photo;
    }

    async assetToPhotoBulk(assets: MediaLibrary.Asset[]): Promise<Photo[]> {
        // allow for failures in bulk processing
        const promises = assets.map(async (asset) => {
            try {
                return await this.assetToPhoto(asset);
            } catch (error) {
                console.error("Failed to convert asset to photo:", error);
            }
        });
        const results = await Promise.allSettled(promises);
        return results
            .filter((result): result is PromiseFulfilledResult<Photo> => result.status === "fulfilled")
            .map(result => result.value);
    }

    albumToLibraryLocation(album: MediaLibrary.Album): PhotoLibraryLocation {
        return {
            name: album.title,
            id: album.id,
            location: album.id
        }
    }

    defaultLibraryLocation(): PhotoLibraryLocation {
        return {
            name: 'Recents',
            id: '',
            location: ''
        }
    }

    normalizeAlbumId(id: string): string | undefined {
        if (id === '') return undefined;
        return id;
    }

    @exposed
    async getLocations(): Promise<PhotoLibraryLocation[]> {
        const hasPermissions = await this.checkPermissions();
        if (!hasPermissions) {
            throw new Error("No permissions to access photo library");
        }
        const fetchedAlbums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
        const libs = fetchedAlbums.map(this.albumToLibraryLocation);
        return [this.defaultLibraryLocation(), ...libs];
    }

    @exposed
    public async deletePhotos(libraryId: string, ids: string[]): Promise<DeletePhotosResponse> {
        const success = await MediaLibrary.deleteAssetsAsync(ids);
        if (!success) {
            throw new Error("Failed to delete photos");
        }
        return {
            deleteCount: ids.length,
            deletedIds: ids
        };
    }

    private mapSortBy(sortBy: string): MediaLibrary.SortByKey {
        console.log("Mapping sortBy:", sortBy);
        switch (sortBy) {
            case 'capturedOn':
                return 'creationTime';
            case 'addedOn':
                return 'creationTime';
            default:
                return 'default';
        }
    }

    @exposed
    public async getPhotos(libraryId: string, params: GetPhotosParams): Promise<GetPhotosResponse> {
        const albumId = this.normalizeAlbumId(libraryId);
        const hasPermissions = await this.checkPermissions();
        if (!hasPermissions) {
            throw new Error("No permissions to access photo library");
        }
        console.log('parameters for getPhotos:', params);
        const fetchedPhotos = await MediaLibrary.getAssetsAsync({
            album: albumId,
            first: params.limit || 100,
            after: params.cursor || undefined,
            mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
            // sortBy: [this.mapSortBy(params.sortBy), params.ascending],
        });
        const photos = await this.assetToPhotoBulk(fetchedPhotos.assets);
        return {
            photos,
            hasMore: fetchedPhotos.hasNextPage,
            nextCursor: fetchedPhotos.endCursor || null,
        };
    }
}
