import { FsDriver } from "../../storageKit/interface";
import { Storage, Thumb, ThumbDetails } from "../../models";
import { generateThumbnailUrl } from "./generator";
import mime from "mime";
import { AgentClient, getClientFromStorage } from "../../agentKit/client";

export default class ThumbService {
  fsDriver: FsDriver;
  storage: Storage;
  agentClient: AgentClient;

  constructor(fsDriver: FsDriver) {
    this.fsDriver = fsDriver;
    this.storage = fsDriver.storage;
  }

  async getAgentClient() {
    if (!this.agentClient) this.agentClient = await getClientFromStorage(this.storage);
    return this.agentClient;
  }

  async getThumbFromAgent(fileId: string, lastUpdated: Date): Promise<ThumbDetails> {
    const client = await this.getAgentClient();
    const thumb = await client.post<ThumbDetails>(
      'api/services/thumb/getThumbnail',
      {
        fileId,
        lastUpdated
      },
    );
    return thumb;
  }

  public async getOrCreateThumb(
    fileId: string,
    lastUpdated: Date,
  ): Promise<ThumbDetails> {

    if(this.storage.isAgentType()) {
      return this.getThumbFromAgent(fileId, lastUpdated);
    }

    let thumb = await Thumb.getThumb(fileId, this.storage);
    if (thumb && thumb.isUpToDate(lastUpdated)) {
      return thumb.getDetails();
    }
    let [stream, mimeType] = await this.fsDriver.readFile(fileId);
    if (!mimeType) {
      mimeType = mime.getType(fileId) || "application/octet-stream";
    }
    const url = await generateThumbnailUrl(stream, mimeType);
    if (thumb) {
      await thumb.updateThumb({
        image: url,
        mimeType,
      });
    } else {
      thumb = await Thumb.createThumb(
        {
          fileId,
          image: url,
          mimeType,
          height: null,
          width: null,
        },
        this.storage,
      );
    }
    return thumb.getDetails();
  }
}
