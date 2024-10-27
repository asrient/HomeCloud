import { NoteItem, RemoteItem, Storage } from "./types";
import { mkDir, writeTextFile, updateTextFile, readDir, readFile, rename, unlink, getStat, getStatByFilename } from "./api/fs";

const CONTENT_FILE = 'note.html';

export type CreateNoteParams = {
    title: string;
    content: string;
    parentId: string;
    storage: Storage;
}

async function filterNoteStats(stats: RemoteItem[]) {
    const filteredStats: RemoteItem[] = [];
    for (const stat of stats) {
        if (stat.type === 'directory') {
            filteredStats.push(stat);
        }
    }
    return filteredStats;
}

const contentFileCache = new Map<string, RemoteItem>();
const absoluteNoteDirs = new Map<number, string>();

function contentFileCacheId(storageId: number, id: string) {
    return `${storageId}:${id}`;
}

async function writeNewContentFile({ storageId, parentId, content }: {
    storageId: number;
    parentId: string;
    content: string;
}): Promise<RemoteItem> {
    return await writeTextFile({
        storageId,
        parentId,
        fileName: CONTENT_FILE,
        content,
        mimeType: 'text/html'
    })
}

async function getAbsoluteNotesDir(storage: Storage): Promise<string> {
    const rootStat = await getStat({
        storageId: storage.id,
        id: getNotesDir(),
    })
    return rootStat.id;
}

async function isRootNote(stat: RemoteItem, storage: Storage) {
    let absoluteNotesDir = absoluteNoteDirs.get(storage.id);
    if (!absoluteNotesDir) {
        absoluteNotesDir = await getAbsoluteNotesDir(storage);
        absoluteNoteDirs.set(storage.id, absoluteNotesDir);
    }
    return stat.parentIds === null || stat.parentIds[0] === absoluteNotesDir;
}

export async function createNote({ title, content, parentId, storage }: CreateNoteParams): Promise<NoteItem> {
    const storageId = storage.id;

    const stat = await mkDir({
        name: title,
        parentId,
        storageId
    })
    const contentFile = await writeNewContentFile({
        storageId,
        parentId: stat.id,
        content
    })
    contentFileCache.set(contentFileCacheId(storageId, stat.id), contentFile);
    return {
        stat,
        storageId,
        childNoteStats: [],
        isRootNote: await isRootNote(stat, storage)
    }
}

async function getOrFetchNoteContentFile(note: NoteItem): Promise<RemoteItem> {
    const cfCacheId = contentFileCacheId(note.storageId, note.stat.id);
    if (contentFileCache.has(cfCacheId)) {
        return contentFileCache.get(cfCacheId)!;
    }
    let contentFile: RemoteItem | null = null;
    try {
        contentFile = await getStatByFilename({
            storageId: note.storageId,
            parentId: note.stat.id,
            name: CONTENT_FILE
        })
    }
    catch (e) {
        contentFile = await writeNewContentFile({
            storageId: note.storageId,
            parentId: note.stat.id,
            content: ''
        })
    }
    contentFileCache.set(cfCacheId, contentFile);
    return contentFile;
}

export async function fetchNoteContent(note: NoteItem): Promise<string> {
    const contentFile = await getOrFetchNoteContentFile(note);
    const contentBlob = await readFile(note.storageId, contentFile.id);
    return await contentBlob.text();
}

export async function setNoteContent(note: NoteItem, content: string) {
    let contentFile = await getOrFetchNoteContentFile(note);
    contentFile = await updateTextFile({
        storageId: note.storageId,
        fileId: contentFile.id,
        content,
        mimeType: 'text/html'
    })
    contentFileCache.set(contentFileCacheId(note.storageId, note.stat.id), contentFile);
}

export async function renameNoteTitle(note: NoteItem, title: string): Promise<{
    newName: string;
    newId: string;
    oldId: string;
    childNoteStats: RemoteItem[];
    storageId: number;
}> {
    const newStat = await rename({
        storageId: note.storageId,
        id: note.stat.id,
        newName: title
    })
    const children = await readDir({
        storageId: note.storageId,
        id: newStat.id
    })
    const childNoteStats = await filterNoteStats(children);
    contentFileCache.delete(contentFileCacheId(note.storageId, note.stat.id));
    return {
        newName: newStat.name,
        newId: newStat.id,
        childNoteStats,
        oldId: note.stat.id,
        storageId: note.storageId,
    }
}

export async function deleteNote(note: NoteItem) {
    await unlink({
        storageId: note.storageId,
        id: note.stat.id
    })
    contentFileCache.delete(contentFileCacheId(note.storageId, note.stat.id));
    return {
        id: note.stat.id,
        storageId: note.storageId
    }
}

export async function getNoteByStat(storage: Storage, stat: RemoteItem): Promise<NoteItem> {
    const children = await readDir({
        storageId: storage.id,
        id: stat.id
    })
    const childNoteStats = await filterNoteStats(children);
    let contentFile = children.find((stat) => stat.name === CONTENT_FILE);
    if (contentFile) {
        contentFileCache.set(contentFileCacheId(storage.id, stat.id), contentFile);
    }
    return {
        stat,
        storageId: storage.id,
        childNoteStats,
        isRootNote: await isRootNote(stat, storage)
    }
}

export async function getNoteById(storage: Storage, id: string): Promise<NoteItem> {
    const stat = await getStat({
        storageId: storage.id,
        id
    })
    return await getNoteByStat(storage, stat);
}

export function getNotesDir() {
    return '<NOTES_DIR>';
}

export function joinNotesDir(...parts: string[]) {
    return `${getNotesDir()}/${parts.join('/')}`;
}
