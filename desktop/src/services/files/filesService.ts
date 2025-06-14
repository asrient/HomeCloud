import { FilesService } from "../../shared/services/filesService";
import LocalFsDriver from "./fs";

export default class DesktopFilesService extends FilesService {
  public fs = new LocalFsDriver();
}
