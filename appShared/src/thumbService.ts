import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./servicePrimatives";


export abstract class ThumbService extends Service {
    public init() {
        this._init();
    }

    abstract generateThumbnailJPEGImpl(filePath: string): Promise<Uint8Array>;
    abstract generateThumbnailURIImpl(filePath: string): Promise<string>;

    @exposed
    @assertServiceRunning
    async generateThumbnailJPEG(filePath: string): Promise<Uint8Array> {
        return this.generateThumbnailJPEGImpl(filePath);
    }

    @exposed
    @assertServiceRunning
    async generateThumbnailURI(filePath: string): Promise<string> {
        return this.generateThumbnailURIImpl(filePath);
    }

    @serviceStartMethod
    public async start() {
    }

    @serviceStopMethod
    public async stop() {
    }
}
