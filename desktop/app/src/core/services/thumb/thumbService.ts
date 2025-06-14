import ThumbGenerator from "./generator";
import { platform } from "os";
import ThumbGeneratorWin from "./generators/win";
import ThumbGeneratorMac from "./generators/mac";
import ThumbGeneratorLinux from "./generators/linux";

export default class ThumbService {
  generator: ThumbGenerator;

  constructor() {
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

  private static _service: ThumbService;

  static async start() {
    if (!this._service) {
      this._service = new ThumbService();
      await this._service.generator.setup();
    }
  }

  static async stop() {
    if (this._service) {
      await this._service.generator.stop();
      this._service = null;
    }
  }

  static getInstace() {
    if (!this._service) {
      throw new Error("Thumbnail service is not started");
    }
    return this._service;
  }

  async generateThumbnailJPEG(filePath: string): Promise<Buffer> {
    return this.generator.generateThumbnailJPEG(filePath);
  }

  async generateThumbnailURI(filePath: string): Promise<string> {
    const buffer = await this.generateThumbnailJPEG(filePath);
    // convert the buffer to uri encoded string
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }
}
