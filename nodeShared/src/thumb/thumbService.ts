import ThumbGenerator from "./generator";
import { ThumbService } from "shared/thumbService";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import { Buffer } from "buffer";

export default abstract class NodeThumbService extends ThumbService {
  private generator: ThumbGenerator | null = null;

  abstract createGenerator(): ThumbGenerator | null;

  init() {
    super.init();
    this.generator = this.createGenerator();
  }

  private assetGenerator(): ThumbGenerator {
    if (this.generator) {
      return this.generator;
    }
    throw new Error("No thumbnail generator available for this platform.");
  }

  @serviceStartMethod
  async start() {
    if (this.generator) {
      await this.generator.setup();
    }
  }

  @serviceStopMethod
  async stop() {
    if (this.generator) {
      await this.generator.stop();
    }
  }

  async generateThumbnailJPEGImpl(filePath: string): Promise<Buffer> {
    return this.assetGenerator().generateThumbnailJPEG(filePath);
  }

  async generateThumbnailURIImpl(filePath: string): Promise<string> {
    const buffer = await this.generateThumbnailJPEG(filePath);
    // convert the buffer to uri encoded string
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  }
}
