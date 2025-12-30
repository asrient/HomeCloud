import { FilesService } from "shared/filesService";
import MobileFsDriver from "./fs";
import { getServiceController } from "shared/utils";
import { Paths, File, Directory } from 'expo-file-system/next';


type PreviewCacheEntry = {
  remoteFingerprint: string;
  remotePath: string;
  expiry: number;
};

function locationHash(remoteFingerprint: string, remotePath: string) {
  return modules.crypto.hashString(`${remoteFingerprint}-${remotePath}`, 'md5').slice(0, 12);
}

export default class MobileFilesService extends FilesService {
  public fs = new MobileFsDriver();
  public separator = '/';

  async download(remoteFingerprint: string | null, remotePath: string): Promise<void> {
    const serviceController = await getServiceController(remoteFingerprint);
    const localSc = modules.getLocalServiceController();
    const defaultDirs = await serviceController.system.getDefaultDirectories();
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
    await stream.pipeTo(file.writableStream());
    localSc.system.openFile(file.uri);
  }

  private cachedPreviewFiles: Map<string, PreviewCacheEntry> = new Map();
  private cleanupTimer: any = null;

  private getCacheDir() {
    return Paths.join(modules.config.DATA_DIR, 'FilePreviews');
  }

  private async clearCache() {
    const cacheDir = this.getCacheDir();
    const dir = new Directory(cacheDir);
    if (dir.exists) {
      dir.delete();
    }
    this.cachedPreviewFiles.clear();
    // Recreate the directory
    new Directory(cacheDir).create({ intermediates: true, idempotent: true });
  }

  async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
    const cacheDir = this.getCacheDir();
    const locHash = locationHash(remoteFingerprint, remotePath);
    const filename = Paths.basename(remotePath);
    console.log('Previewing remote file:', remotePath, 'with hash:', locHash);
    console.log('filename for preview:', filename);
    let cacheEntry = this.cachedPreviewFiles.get(locHash);
    let previewFile: File | null = null;
    if (cacheEntry) {
      previewFile = new File(Paths.join(cacheDir, locHash, filename));
      if (!previewFile.exists) {
        cacheEntry = undefined;
        this.cachedPreviewFiles.delete(locHash);
      }
    }
    if (!cacheEntry) {
      const serviceController = await getServiceController(remoteFingerprint);
      const remoteItem = await serviceController.files.fs.readFile(remotePath);
      const dir = new Directory(cacheDir, locHash);
      dir.create({ intermediates: true, idempotent: true });
      previewFile = new File(Paths.join(dir.uri, filename));
      previewFile.create({ overwrite: true });
      await remoteItem.stream.pipeTo(previewFile.writableStream());
      this.cachedPreviewFiles.set(locHash, {
        remoteFingerprint,
        remotePath,
        expiry: Date.now() + 30 * 60 * 1000 // 30 min expiry
      });
    }
    if (previewFile) {
      const localSc = modules.getLocalServiceController();
      localSc.system.openFile(previewFile.uri);
    }
  }

  private startCleanupTimer() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
    }
    this.cleanupTimer = setTimeout(() => {
      const now = Date.now();
      for (const [locHash, entry] of this.cachedPreviewFiles.entries()) {
        if (entry.expiry < now) {
          const previewFile = new File(Paths.join(this.getCacheDir(), locHash));
          if (previewFile.exists) {
            previewFile.delete();
          }
          this.cachedPreviewFiles.delete(locHash);
        }
      }
      this.startCleanupTimer();
    }, 10 * 60 * 1000); // 10 minutes
  }

  async start() {
    // Mobile-specific startup logic can go here
    await this.clearCache();
    this.startCleanupTimer();
    return super.start();
  }
}
