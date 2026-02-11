import { ThumbService } from "shared/thumbService";
import superman from '@/modules/superman';
import { Buffer } from 'buffer';
import { pathToUri } from "./fileUtils";

export default class MobileThumbService extends ThumbService {
  async generateThumbnailJPEGImpl(filePath: string): Promise<Buffer> {
    filePath = pathToUri(filePath);
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
