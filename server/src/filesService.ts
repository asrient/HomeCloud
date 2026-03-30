import NodeFilesService from "nodeShared/files/filesService.js";
import { FileFilter, RemoteItem } from "shared/types.js";

export default class ServerFilesService extends NodeFilesService {
    override async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
        console.log(`[Server] Opening remote files is not supported. fingerprint=${remoteFingerprint}, path=${remotePath}`);
    }

    public async openFilePicker(selectMultiple: boolean, pickDir?: boolean, filters?: FileFilter[], title?: string, buttonText?: string): Promise<RemoteItem[] | null> {
        console.log(`[Server] Opening file picker is not supported. selectMultiple=${selectMultiple}, title=${title}`);
        return null;
    }
}
