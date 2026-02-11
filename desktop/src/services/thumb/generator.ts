export default abstract class ThumbGenerator {
  abstract generateThumbnailJPEG(filePath: string): Promise<Buffer>;
  async setup() {}
  async stop() {}
}
