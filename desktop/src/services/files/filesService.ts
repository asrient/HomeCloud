import { FilesService } from "shared/filesService";
import LocalFsDriver from "./fs";
import path from "path";
import fs from "fs/promises";
import { getServiceController } from "shared/utils";
import { WatchedFile } from "./watchedFile";
import { exposed } from "shared/servicePrimatives";
import { FileFilter, RemoteItem } from "shared/types";
import { dialog, OpenDialogOptions } from 'electron';

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
            console.warn(`Failed to add default pinned folder "${folder.name}":`, e);
          }
        }
      }
    } catch (e) {
      console.error("Failed to add default pinned folders:", e);
    }

    // Mark as done regardless of success to avoid retrying on every start
    this.store.setItem(DEFAULT_PINS_KEY, true);
    await this.store.save();
  }

  @exposed
  async download(remoteFingerprint: string | null, remotePath: string): Promise<void> {
    const serviceController = await getServiceController(remoteFingerprint);
    const localSc = modules.getLocalServiceController();
    const defaultDirs = await localSc.system.getDefaultDirectories();
    const downloadDir = defaultDirs.Downloads;
    const remoteItem = await serviceController.files.fs.readFile(remotePath);
    const { name: fileName, stream } = remoteItem;
    let filePath = path.join(downloadDir, fileName);
    let counter = 1;

    // Function to check if the file exists and generate a unique name if needed
    async function checkAndWrite() {
      try {
        await fs.access(filePath, fs.constants.F_OK);
        const ext = path.extname(fileName);
        const base = path.basename(fileName, ext);
        const newFileName = `${base} (${counter})${ext}`;
        filePath = path.join(downloadDir, newFileName);
        counter++;
        return checkAndWrite();
      } catch (e) {
        await fs.writeFile(filePath, stream);
      }
    }
    await checkAndWrite();
    localSc.system.openFile(filePath);
  }

  async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
    await WatchedFile.start(remoteFingerprint, remotePath);
  }

  public async openFilePicker(selectMultiple: boolean, pickDir?: boolean, filters?: FileFilter[], title?: string, buttonText?: string): Promise<RemoteItem[] | null> {
    if (!filters || filters.length === 0) {
      filters = [{ name: 'All files', extensions: ['*'] }];
    }
    const properties: OpenDialogOptions['properties'] = [
      pickDir ? 'openDirectory' : 'openFile',
    ];
    if (selectMultiple) {
      properties.push('multiSelections');
    }
    const result = await dialog.showOpenDialog({
      title: title || (selectMultiple ? 'Select files' : 'Select a file'),
      buttonLabel: buttonText || 'Open',
      filters,
      properties,
    })
    if (result.canceled) {
      return null;
    }
    const items: RemoteItem[] = [];
    await Promise.allSettled(result.filePaths.map(async (path) => {
      const item = await this.fs.getStat(path);
      items.push(item);
    }))
    return items;
  }
}
