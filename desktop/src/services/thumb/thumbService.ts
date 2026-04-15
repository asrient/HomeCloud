import ThumbGenerator from "nodeShared/thumb/generator";
import { platform } from "os";
import ThumbGeneratorWin from "./generators/win";
import ThumbGeneratorMac from "./generators/mac";
import ThumbGeneratorLinux from "nodeShared/thumb/linuxGenerator";
import NodeThumbService from "nodeShared/thumb/thumbService";

export default class DesktopThumbService extends NodeThumbService {
  createGenerator(): ThumbGenerator | null {
    switch (platform()) {
      case "win32":
        return new ThumbGeneratorWin();
      case "darwin":
        return new ThumbGeneratorMac();
      case "linux":
        return new ThumbGeneratorLinux();
      default:
        return null;
    }
  }
}
