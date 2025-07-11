import { ThumbService } from "shared/services/thumbService";
import { serviceStartMethod, serviceStopMethod } from "shared/services/primatives";
import superman from '@/modules/superman';

export default class MobileThumbService extends ThumbService {
  @serviceStartMethod
  async start() {
  }

  @serviceStopMethod
  async stop() {
  }

  async generateThumbnailJPEGImpl(filePath: string): Promise<Buffer> {
    const buffer = await superman.generateThumbnailJpeg(filePath);
    if (!buffer || !(buffer instanceof Uint8Array)) {
      throw new Error('Failed to generate thumbnail JPEG');
    }
    return Buffer.from(buffer);
  }

  async generateThumbnailURIImpl(filePath: string): Promise<string> {
    const buffer = await this.generateThumbnailJPEG(filePath);
    // convert the buffer to uri encoded string
    const base64 = Buffer.from(buffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  }
}
