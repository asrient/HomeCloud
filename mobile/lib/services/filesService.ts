import { FilesService } from "shared/filesService";
import MobileFsDriver from "./fs";
import { getServiceController } from "shared/utils";
import { Paths, File, Directory } from 'expo-file-system/next';
import { exposed } from "shared/servicePrimatives";
import { FileContent, PreviewOptions } from "shared/types";
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isHeicFile, resolveFileUri } from "./fileUtils";
import { FileCache } from "./fileCache";

function previewId(filePath: string) {
  return modules.crypto.hashString(filePath, 'md5').slice(0, 12);
}

function remoteFileId(remoteFingerprint: string, remotePath: string) {
  return modules.crypto.hashString(`${remoteFingerprint}-${remotePath}`, 'md5').slice(0, 12);
}

/**
 * Writes a ReadableStream to a file using FileHandle for fast synchronous writes.
 * @param deleteOnError If true, deletes the file when the stream errors (e.g. connection lost).
 */
async function writeStreamToFile(stream: ReadableStream<Uint8Array>, file: File, deleteOnError = false): Promise<void> {
  const reader = stream.getReader();
  const handle = file.open();
  let success = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      handle.writeBytes(value);
    }
    success = true;
  } finally {
    handle.close();
    if (!success && deleteOnError) {
      try { if (file.exists) file.delete(); } catch { /* ignore */ }
    }
  }
}

export default class MobileFilesService extends FilesService {
  public fs = new MobileFsDriver();
  public separator = '/';
  // expo-image-manipulator stores the converted images in this directory.
  private previewCache = new FileCache('ImageManipulator', { maxItems: 15 });
  private remoteFileCache = new FileCache('FilePreviews', { maxItems: 10 });

  @exposed
  async download(remoteFingerprint: string | null, remotePath: string): Promise<void> {
    const serviceController = await getServiceController(remoteFingerprint);
    const localSc = modules.getLocalServiceController();
    const defaultDirs = await localSc.system.getDefaultDirectories();
    const downloadDir = defaultDirs.Downloads;
    if (!downloadDir) {
      throw new Error("Download directory not found.");
    }
    const fileContent = await serviceController.files.fs.readFile(remotePath);
    const { name: fileName, stream } = fileContent;
    let file = new File(Paths.join(downloadDir, fileName));
    file.create({
      intermediates: true,
      overwrite: true
    });
    await writeStreamToFile(stream, file, true);
    localSc.system.openFile(file.uri);
  }

  @exposed
  async getPreview(filePath: string, opts?: PreviewOptions): Promise<FileContent> {
    // Resolve the file URI to get actual path, filename, and mime type
    const supportsHeic = opts?.supportsHeic ?? false;
    const resolved = await resolveFileUri(filePath);
    const isHeic = isHeicFile(resolved.mimeType || '', resolved.filename);

    // If it's HEIC, convert directly without reading first
    if (isHeic && !supportsHeic) {
      // Check if we have a cached converted version
      const id = previewId(filePath);
      const cachedPath = this.previewCache.get(id);
      if (cachedPath) {
        console.log('Using cached converted HEIC preview:', cachedPath);
        const cachedFile = new File(cachedPath);
        const convertedName = resolved.filename.replace(/\.(heic|heif)$/i, '.jpg');
        return {
          name: convertedName,
          mime: 'image/jpeg',
          stream: cachedFile.readableStream(),
        };
      }

      // console.log('Converting HEIC image for preview:', filePath, '->', resolved.fileUri);
      try {
        const context = ImageManipulator.manipulate(resolved.fileUri);
        const imageRef = await context.renderAsync();
        const result = await imageRef.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.9,
        });

        // Track the converted file in cache
        this.previewCache.log(id, result.uri);

        const convertedFile = new File(result.uri);
        const convertedName = resolved.filename.replace(/\.(heic|heif)$/i, '.jpg');
        return {
          name: convertedName,
          mime: 'image/jpeg',
          stream: convertedFile.readableStream(),
        };
      } catch (error) {
        console.error('Failed to convert HEIC image:', error);
        // Fall back to original file if conversion fails
        return this.fs.readFile(filePath);
      }
    }

    return this.fs.readFile(filePath);
  }

  async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
    const id = remoteFileId(remoteFingerprint, remotePath);
    const filename = Paths.basename(remotePath);
    console.log('Previewing remote file:', remotePath, 'with id:', id);

    let cachedPath = this.remoteFileCache.get(id);
    if (!cachedPath) {
      const serviceController = await getServiceController(remoteFingerprint);
      const t0 = Date.now();
      const remoteItem = await serviceController.files.fs.readFile(remotePath);
      console.log(`[Preview] RPC readFile returned in ${Date.now() - t0}ms`);
      const entryDir = new Directory(this.remoteFileCache.dir, id);
      entryDir.create({ intermediates: true, idempotent: true });
      const previewFile = new File(Paths.join(entryDir.uri, filename));
      previewFile.create({ overwrite: true });
      const t1 = Date.now();
      await writeStreamToFile(remoteItem.stream, previewFile, true);
      console.log(`[Preview] writeStreamToFile completed in ${Date.now() - t1}ms`);
      this.remoteFileCache.log(id, previewFile.uri);
      cachedPath = previewFile.uri;
    }

    console.log(`[Preview] Opening file: ${cachedPath}`);
    const localSc = modules.getLocalServiceController();
    localSc.system.openFile(cachedPath);
  }

  async start() {
    this.previewCache.start();
    this.remoteFileCache.start();
    await super.start();
  }

  async stop() {
    await super.stop();
  }
}
