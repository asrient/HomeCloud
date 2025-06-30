import { FilesService } from "shared/services/filesService";
import LocalFsDriver from "./fs";
import path from "path";

export default class DesktopFilesService extends FilesService {
  public fs = new LocalFsDriver();
  public separator = path.sep;
}
