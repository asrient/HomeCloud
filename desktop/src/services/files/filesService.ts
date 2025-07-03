import { FilesService } from "shared/services/filesService";
import LocalFsDriver from "./fs";
import path from "path";
import { RemoteItem } from "shared/types";
import fs from "fs/promises";
import { getServiceController } from "shared/utils";
import { getFileContent } from "./fileUtils";
import { WatchedFile } from "./watchedFile";

export default class DesktopFilesService extends FilesService {
  public fs = new LocalFsDriver();
  public separator = path.sep;

  async download(remoteFingerprint: string | null, remotePath: string): Promise<void> {
    const serviceController = await getServiceController(remoteFingerprint);
    const localSc = modules.getLocalServiceController();
    const defaultDirs = await serviceController.system.getDefaultDirectories();
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

  async _moveSingle(
    remoteFingerprint: string | null,
    remoteFolderId: string,
    localFilePath: string,
    deleteSource: boolean
  ): Promise<RemoteItem[]> {
    // walk through the file path if a directory
    const fileStat = await fs.stat(localFilePath);
    if (fileStat.isDirectory()) {
      const files = await fs.readdir(localFilePath);
      const promises = files.map(async (file, ind) => {
        const filePath = path.join(localFilePath, file);
        // delay the next call to avoid too many concurrent requests.
        if (ind > 0) {
          await new Promise((resolve) => setTimeout(resolve, ind * 100));
        }
        return this._moveSingle(remoteFingerprint, remoteFolderId, filePath, deleteSource);
      });
      return Promise.allSettled(promises).then(results => {
        const items = [];
        results.forEach(result => {
          if (result.status === "fulfilled") {
            items.push(...result.value);
          } else {
            console.error("Failed to move file:", result.reason);
          }
        });
        return items;
      });
    } else {
      const serviceController = await getServiceController(remoteFingerprint);
      const fileContent = getFileContent(localFilePath);
      const remoteItem = await serviceController.files.fs.writeFile(
        remoteFolderId,
        fileContent
      );
      return [remoteItem];
    }
  }
}
