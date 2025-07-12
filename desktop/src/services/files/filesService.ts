import { FilesService } from "shared/services/filesService";
import LocalFsDriver from "./fs";
import path from "path";
import fs from "fs/promises";
import { getServiceController } from "shared/utils";
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
}
