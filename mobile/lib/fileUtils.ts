import { PinnedFolder, RemoteItem, PeerInfo } from "shared/types";
import { FileRemoteItem, MobilePlatform, RemoteItemWithPeer } from "./types";
import mime from 'mime';
import { Href } from "expo-router";
import { Paths } from 'expo-file-system/next';

export enum FileType {
    File = 'File',
    Folder = 'Folder',
    Image = 'Image',
    Video = 'Video',
    Audio = 'Audio',
    Text = 'Text',
    Font = 'Font',
    EPUB = 'EPUB',
    PDF = 'PDF',
    ZIP = 'ZIP',
    SevenZip = '7Z',
    RAR = 'RAR',
    TAR = 'TAR',
    GoogleDocs = 'Google Docs',
    GoogleSheets = 'Google Sheets',
    GoogleSlides = 'Google Slides',
    Doc = 'Document',
    Excel = 'Spreedsheet',
    PowerPoint = 'Presentation',
    Json = 'JSON',
    Markdown = 'Markdown',
    Yaml = 'YAML',
    Xml = 'XML',
    Csv = 'CSV',
    Html = 'HTML',
    Javascript = 'Javascript',
    Css = 'CSS',
    Python = 'Python',
    Java = 'Java',
    C = 'C',
    Cpp = 'C++',
    Go = 'Go',
    Swift = 'Swift',
    Drive = 'Drive',
    App = 'App',
    Exe = 'Application',
    MSI = 'Windows Installer',
    AppImage = 'AppImage',
    Deb = 'Debian Package',
    DMG = 'Apple Disk Image',
    RPM = 'RPM Package',
}

export function mimeToKind(mimeType: string): FileType {
    switch (mimeType) {
        case 'application/x-folder':
            return FileType.Folder;
        case 'application/x-apple-app':
            return FileType.App;
        case 'application/vnd.microsoft.portable-executable':
            return FileType.Exe;
        case 'application/x-msi':
            return FileType.MSI;
        case 'application/x-executable':
            return FileType.AppImage;
        case 'application/vnd.debian.binary-package':
            return FileType.Deb;
        case 'application/x-rpm':
            return FileType.RPM;
        case 'application/x-apple-diskimage':
            return FileType.DMG;
        case 'application/x-drive':
            return FileType.Drive;
        case 'application/epub+zip':
            return FileType.EPUB;
        case 'application/pdf':
            return FileType.PDF;
        case 'application/zip':
            return FileType.ZIP;
        case 'application/x-7z-compressed':
            return FileType.SevenZip;
        case 'application/x-bzip':
            return FileType.ZIP;
        case 'application/x-bzip2':
            return FileType.ZIP;
        case 'application/x-rar-compressed':
            return FileType.RAR;
        case 'application/x-tar':
            return FileType.TAR;
        case 'application/vnd.rar':
            return FileType.RAR;
        case 'application/vnd.google-apps.document':
            return FileType.GoogleDocs;
        case 'application/vnd.google-apps.spreadsheet':
            return FileType.GoogleSheets;
        case 'application/vnd.google-apps.presentation':
            return FileType.GoogleSlides;
        case 'application/vnd.google-apps.folder':
            return FileType.Folder;
        case 'application/msword':
            return FileType.Doc;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
            return FileType.Doc;
        case 'application/vnd.ms-excel':
            return FileType.Excel;
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
            return FileType.Excel;
        case 'application/vnd.ms-powerpoint':
            return FileType.PowerPoint;
        case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
            return FileType.PowerPoint;
        case 'application/vnd.oasis.opendocument.presentation':
            return FileType.PowerPoint;
        case 'application/vnd.oasis.opendocument.spreadsheet':
            return FileType.Excel;
        case 'application/vnd.oasis.opendocument.text':
            return FileType.Doc;
        case 'application/vnd.oasis.opendocument.graphics':
            return FileType.Image;
        case 'application/rtf':
            return FileType.Text;
        case 'application/json':
            return FileType.Json;
        case 'text/markdown':
            return FileType.Markdown;
        case 'text/yaml':
            return FileType.Yaml;
        case 'text/xml':
            return FileType.Xml;
        case 'text/csv':
            return FileType.Csv;
        case 'text/html':
            return FileType.Html;
        case 'text/javascript':
            return FileType.Javascript;
        case 'application/javascript':
            return FileType.Javascript;
        case 'text/css':
            return FileType.Css;
        case 'text/x-python':
            return FileType.Python;
        case 'text/x-java-source':
            return FileType.Java;
        case 'text/x-c':
            return FileType.C;
        case 'text/x-c++':
            return FileType.Cpp;
        case 'text/x-go':
            return FileType.Go;
        case 'text/x-swift':
            return FileType.Swift;
    }
    const kind = mimeType.split('/')[0];
    switch (kind) {
        case 'image':
            return FileType.Image;
        case 'video':
            return FileType.Video;
        case 'audio':
            return FileType.Audio;
        case 'text':
            return FileType.Text;
        case 'font':
            return FileType.Font;
    }
    return FileType.File;
}

export function getKind(item: RemoteItem) {
    if (item.type === 'directory') {
        if (!!item.mimeType) return mimeToKind(item.mimeType);
        return FileType.Folder;
    }
    const mimeType = !!item.mimeType ? item.mimeType : mime.getType(item.name);
    if (!mimeType) return FileType.File;
    return mimeToKind(mimeType);
}

export function canGenerateThumbnail(item: RemoteItem) {
    if (item.type === 'directory') {
        return false;
    }
    if (modules.config.PLATFORM === MobilePlatform.IOS) {
        return true;
    }
    const kind = getKind(item);
    return kind === FileType.Image || kind === FileType.Video;
}

export function pinnedFolderToRemoteItem(pinnedFolder: PinnedFolder, fingerprint: string | null): RemoteItemWithPeer {
    return {
        path: pinnedFolder.path,
        name: pinnedFolder.name,
        type: 'directory',
        size: 0,
        mimeType: '',
        lastModified: new Date(),
        createdAt: new Date(),
        etag: '',
        thumbnail: '',
        deviceFingerprint: fingerprint,
    }
}

export const remoteItemToFileRemoteItem = (item: RemoteItem, fingerprint: string | null): FileRemoteItem => {
    return {
        ...item,
        isSelected: false,
        deviceFingerprint: fingerprint,
    }
}

export function peerToRemoteItem(peer: PeerInfo | null): RemoteItemWithPeer {
    return {
        path: '',
        name: peer ? peer.deviceName : 'This Device',
        type: 'directory',
        size: 0,
        mimeType: '',
        lastModified: new Date(),
        createdAt: new Date(),
        etag: '',
        thumbnail: '',
        deviceFingerprint: peer ? peer.fingerprint : null,
    }
}

export function getDefautIconUri(item: RemoteItem) {
    const kind = getKind(item);
    switch (kind) {
        case FileType.Drive:
            return require('@/assets/images/fileicons/ssd.png');
        case FileType.Folder:
            return require('@/assets/images/fileicons/folder.png');
        case FileType.Image:
            return require('@/assets/images/fileicons/image.png');
        case FileType.Video:
            return require('@/assets/images/fileicons/video.png');
        case FileType.Audio:
            return require('@/assets/images/fileicons/audio.png');
        case FileType.PDF:
            return require('@/assets/images/fileicons/pdf.png');
        case FileType.Text:
            return require('@/assets/images/fileicons/text.png');
        default:
            return require('@/assets/images/fileicons/file.png');
    }
}

export type FolderRouteParams = {
    p?: string;
    f?: string;
}

export function getFolderAppRoute(path: string, fingerprint: string | null): Href {
    const encodedPath = encodeURIComponent(path);
    const fingerprintPart = fingerprint || 'null';
    return {
        pathname: '/files/folder',
        params: { p: encodedPath, f: fingerprintPart } as FolderRouteParams
    }
}

export function extractFolderParamsFromRoute(route: { params: FolderRouteParams }): { path: string; fingerprint: string | null } {
    const params = route.params;
    const path = params.p ? decodeURIComponent(params.p) : '';
    const fingerprint = params.f && params.f !== 'null' ? params.f : null;
    return { path, fingerprint };
}

export function extractNameFromPath(path: string): string {
    // handle both / and \ as path separators
    return decodeURIComponent(Paths.basename(path));
}
