import { Service, serviceStartMethod, serviceStopMethod, exposed, info, input, output, assertServiceRunning, wfApi } from "./servicePrimatives";
import { Sch } from "./types";

export abstract class ThumbService extends Service {
    public init() {
        this._init();
    }

    abstract generateThumbnailJPEGImpl(filePath: string): Promise<Uint8Array>;
    abstract generateThumbnailURIImpl(filePath: string): Promise<string>;

    @assertServiceRunning
    async generateThumbnailJPEG(filePath: string): Promise<Uint8Array> {
        return this.generateThumbnailJPEGImpl(filePath);
    }

    @exposed @info("Generate a thumbnail data URI for a file")
    @wfApi
    @input(Sch.String)
    @output(Sch.String)
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
