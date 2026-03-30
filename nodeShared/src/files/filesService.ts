import { FilesService } from "shared/filesService";
import LocalFsDriver from "./fs";
import path from "path";
import fs from "fs/promises";
import { getServiceController } from "shared/utils";
import { exposed } from "shared/servicePrimatives";
import { FileFilter, RemoteItem } from "shared/types";

const DEFAULT_PINS_KEY = "defaultPinsAdded";

export default class DesktopFilesService extends FilesService {
  public fs = new LocalFsDriver();
  public separator = path.sep;

  public async start() {
    await super.start();
    await this.addDefaultPinnedFolders();
  }

  private async addDefaultPinnedFolders(): Promise<void> {
    const defaultPinsAdded = this.store.getItem<boolean>(DEFAULT_PINS_KEY);
    if (defaultPinsAdded) {
      return;
    }

    try {
      const localSc = modules.getLocalServiceController();
      const defaultDirs = await localSc.system.getDefaultDirectories();

      const foldersToPin: { path: string | null; name: string }[] = [
        { path: defaultDirs.Desktop, name: 'Desktop' },
        { path: defaultDirs.Downloads, name: 'Downloads' },
        { path: defaultDirs.Pictures, name: 'Pictures' },
        { path: defaultDirs.Documents, name: 'Documents' },
      ];

      for (const folder of foldersToPin) {
        if (folder.path) {
          try {
            await this.addPinnedFolder(folder.path, folder.name);
          } catch (e) {
            // Ignore errors for individual folders (e.g., already exists)
            console.warn(`[FilesService] Failed to add default pinned folder:`, e);
          }
        }
      }
    } catch (e) {
      console.error("[FilesService] Failed to add default pinned folders:", e);
    }

    // Mark as done regardless of success to avoid retrying on every start
    this.store.setItem(DEFAULT_PINS_KEY, true);
    await this.store.save();
  }

  @exposed
  async download(remoteFingerprint: string | null, remotePaths: string[]): Promise<void> {
    const serviceController = await getServiceController(remoteFingerprint);
    const localSc = modules.getLocalServiceController();
    const defaultDirs = await localSc.system.getDefaultDirectories();
    const downloadDir = defaultDirs.Downloads;

    for (const remotePath of remotePaths) {
      await this.downloadSingle(serviceController, remotePath, downloadDir);
    }

    if (remotePaths.length === 1) {
      // Open the single downloaded item
      const stat = await serviceController.files.fs.getStat(remotePaths[0]);
      localSc.system.openFile(path.join(downloadDir, stat.name));
    } else {
      localSc.system.openFile(downloadDir);
    }
  }

  private async downloadSingle(serviceController: any, remotePath: string, localDir: string): Promise<void> {
    const stat = await serviceController.files.fs.getStat(remotePath);
    if (stat.type === 'directory') {
      const dirPath = path.join(localDir, stat.name);
      await fs.mkdir(dirPath, { recursive: true });
      const children = await serviceController.files.fs.readDir(remotePath);
      for (const child of children) {
        await this.downloadSingle(serviceController, child.path, dirPath);
      }
    } else {
      const { name: fileName, stream } = await serviceController.files.fs.readFile(remotePath);
      let filePath = path.join(localDir, fileName);
      let counter = 1;
      // Deduplicate filename
      while (true) {
        try {
          await fs.access(filePath, fs.constants.F_OK);
          const ext = path.extname(fileName);
          const base = path.basename(fileName, ext);
          filePath = path.join(localDir, `${base} (${counter})${ext}`);
          counter++;
        } catch {
          break; // File doesn't exist, safe to write
        }
      }
      try {
        await fs.writeFile(filePath, stream);
      } catch (writeErr) {
        try { await fs.unlink(filePath); } catch { /* ignore */ }
        throw writeErr;
      }
    }
  }

  async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
    throw new Error("Opening remote files is not supported on this platform.");
  }
}
