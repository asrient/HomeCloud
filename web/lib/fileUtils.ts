import { DeviceInfo, PinnedFolder, RemoteItem, PeerInfo } from "shared/types";
import { RemoteItemWithPeer } from "./types";
import { OSType } from "@/lib/enums";
import mime from 'mime';
import { getServiceController } from "./utils";

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

function iconFilename(kind: FileType) {
    switch (kind) {
        case FileType.Drive:
            return 'ssd.png';
        case FileType.File:
            return 'file.png';
        case FileType.Text:
            return 'text.png';
        case FileType.Markdown:
            return 'text.png';
        case FileType.Folder:
            return 'folder.png';
        case FileType.Image:
            return 'image.png';
        case FileType.Video:
            return 'video.png';
        case FileType.Audio:
            return 'audio.png';
        case FileType.EPUB:
            return 'epub.png';
        case FileType.PDF:
            return 'pdf.png';
        case FileType.ZIP:
        case FileType.SevenZip:
        case FileType.RAR:
        case FileType.TAR:
            return 'archive.png';
        case FileType.GoogleDocs:
            return 'google-docs.png';
        case FileType.GoogleSheets:
            return 'google-sheets.png';
        case FileType.GoogleSlides:
            return 'google-slides.png';
        case FileType.Doc:
            return 'word.png';
        case FileType.Excel:
            return 'excel.png';
        case FileType.PowerPoint:
            return 'powerpoint.png';
        case FileType.Json:
            return 'json.png';
        case FileType.Yaml:
            return 'code.png';
        case FileType.Xml:
            return 'xml.png';
        case FileType.Csv:
            return 'csv.png';
        case FileType.Html:
            return 'html.png';
        case FileType.Javascript:
            return 'javascript.png';
        case FileType.Css:
            return 'css.png';
        case FileType.Python:
            return 'python.png';
        case FileType.Java:
            return 'java.png';
        case FileType.C:
            return 'c.png';
        case FileType.Cpp:
            return 'cpp.png';
        case FileType.Go:
            return 'go.png';
        case FileType.Swift:
            return 'code.png';
        case FileType.App:
            return 'app.png';
        case FileType.Exe:
            return 'program.png';
        case FileType.MSI:
            return 'installer.png';
        case FileType.AppImage:
            return 'installer.png';
        case FileType.Deb:
            return 'deb.png';
        case FileType.DMG:
            return 'dmg.png';
        case FileType.RPM:
            return 'installer.png';
        default:
            return 'file.png';
    }
}

export function iconUrl(kind: FileType) {
    return `/icons/${iconFilename(kind)}`;
}

export function getDefaultIcon(item: RemoteItem) {
    return iconUrl(getKind(item));
}

export function canGenerateThumbnail(item: RemoteItem) {
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

export function getPathChain(path: string): RemoteItem[] {
    // check for both / and \ as path separators
    const separator = path.includes('/') ? '/' : '\\';
    const hasLeadingSeparator = path.startsWith(separator);
    const parts = path.split(separator).filter(part => part.length > 0);
    const chain: RemoteItem[] = [];
    let currentPath = '';
    for (const part of parts) {
        if (currentPath.length === 0 && !hasLeadingSeparator) {
            currentPath = part; // first part without leading separator
        } else {
            currentPath += separator + part;
        }
        chain.push({
            path: currentPath,
            name: part,
            type: 'directory',
            size: 0,
            mimeType: '',
            lastModified: new Date(),
            createdAt: new Date(),
            etag: '',
            thumbnail: '',
        });
    }
    return chain;
}

export function getFileUrl(fingerprint: string | null, path: string) {
    return `app://media/previewFile?fingerprint=${fingerprint}&path=${path}`;
}

export function canPreview(mimeType: string) {
    return mimeType.startsWith('image/') ||
        mimeType.startsWith('video/') ||
        mimeType.startsWith('audio/') ||
        mimeType === 'application/pdf' ||
        mimeType === 'application/epub+zip' ||
        mimeType.startsWith('text/') ||
        mimeType === 'application/json';
}

export function getNativeFilesAppName(deviceInfo: DeviceInfo | null) {
    if (deviceInfo?.os === OSType.MacOS) {
        return 'Finder';
    }
    if (deviceInfo?.os === OSType.Windows) {
        return 'File Explorer';
    }
    return 'File Manager';
}

export function getNativeFilesAppIcon(deviceInfo: DeviceInfo | null) {
    if (deviceInfo?.os === OSType.MacOS) {
        return '/icons/finder.png';
    }
    if (deviceInfo?.os === OSType.Windows) {
        return '/icons/file-explorer.png';
    }
    return '/icons/folder.png';
}

const CLIPBOARD_KEY = 'files-clipboard';

export function setItemsToCopy(fingerprint: string | null, itemIds: string[], cut = false) {
    const clipboardJson = {
        fingerprint,
        itemIds,
        cut,
    }
    sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboardJson));
}

export function getItemsToCopy(): { fingerprint: string | null, itemIds: string[], cut: boolean } | null {
    const clipboardJson = sessionStorage.getItem(CLIPBOARD_KEY);
    if (!clipboardJson) return null;
    return JSON.parse(clipboardJson);
}

export function clearItemsToCopy() {
    sessionStorage.removeItem(CLIPBOARD_KEY);
}

export function hasItemsToCopy() {
    return !!sessionStorage.getItem(CLIPBOARD_KEY);
}

export async function performCopyItems(destFingerprint: string | null, destFolderId: string) {
    const clipboard = getItemsToCopy();
    if (!clipboard) return;
    const { fingerprint: sourceFingerprint, itemIds, cut } = clipboard;
    const serviceController = await getServiceController(sourceFingerprint);
    const res = await serviceController.files.move(destFingerprint, destFolderId, itemIds, cut);
    if (cut) {
        clearItemsToCopy();
    }
    return res;
}
