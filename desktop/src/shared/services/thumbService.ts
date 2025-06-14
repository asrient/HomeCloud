import { Service, serviceStartMethod, serviceStopMethod, exposed, assertServiceRunning } from "./primatives";


export abstract class ThumbService extends Service {
    public init() {
        this._init();
    }

    abstract generateThumbnailJPEGImpl(filePath: string): Promise<Buffer>;
    abstract generateThumbnailURIImpl(filePath: string): Promise<string>;

    @exposed
    @assertServiceRunning
    async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
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
