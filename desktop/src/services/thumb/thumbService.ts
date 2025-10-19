import ThumbGenerator from "./generator";
import { platform } from "os";
import ThumbGeneratorWin from "./generators/win";
import ThumbGeneratorMac from "./generators/mac";
import ThumbGeneratorLinux from "./generators/linux";
import { ThumbService } from "shared/thumbService";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import { Buffer } from "buffer";

export default class DesktopThumbService extends ThumbService {
  generator: ThumbGenerator;

  init() {
    super.init();
    switch (platform()) {
      case "win32":
        this.generator = new ThumbGeneratorWin();
        break;
      case "darwin":
        this.generator = new ThumbGeneratorMac();
        break;
      case "linux":
        this.generator = new ThumbGeneratorLinux();
        break;
      default:
        throw new Error(`Thumbnail service is not supported on ${platform()}`);
    }
  }


  @serviceStartMethod
  async start() {
    await this.generator.setup();
  }

  @serviceStopMethod
  async stop() {
    await this.generator.stop();
  }

  async generateThumbnailJPEGImpl(filePath: string): Promise<Buffer> {
    return this.generator.generateThumbnailJPEG(filePath);
  }

  async generateThumbnailURIImpl(filePath: string): Promise<string> {
    const buffer = await this.generateThumbnailJPEG(filePath);
    // convert the buffer to uri encoded string
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  }
}
