import ThumbGenerator from "nodeShared/thumb/generator";
import { platform } from "os";
import ThumbGeneratorLinux from "nodeShared/thumb/linuxGenerator";
import NodeThumbService from "nodeShared/thumb/thumbService";

export default class ServerThumbService extends NodeThumbService {
  createGenerator(): ThumbGenerator | null {
    switch (platform()) {
      case "linux":
        return new ThumbGeneratorLinux();
      default:
        return null;
    }
  }
}
