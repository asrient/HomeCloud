import { FilesService } from "shared/services/filesService";
import MobileFsDriver from "./fs";
import { getServiceController } from "shared/utils";
import { Paths, File } from 'expo-file-system/next';


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

  async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
