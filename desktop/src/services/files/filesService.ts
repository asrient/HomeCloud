import NodeFilesService from "nodeShared/files/filesService";
import { WatchedFile } from "./watchedFile";
import { FileFilter, RemoteItem } from "shared/types";
import { dialog, OpenDialogOptions } from 'electron';

export default class DesktopFilesService extends NodeFilesService {
  override async _openRemoteFile(remoteFingerprint: string, remotePath: string): Promise<void> {
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
