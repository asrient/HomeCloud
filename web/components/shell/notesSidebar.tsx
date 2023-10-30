import { AppName, NoteItem, RemoteItem, Storage } from "@/lib/types";
import useFilterStorages from "../hooks/useFilterStorages";
import { useAppDispatch, useAppState } from "../hooks/useAppState";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getNoteByStat } from "@/lib/noteUtils";
import { readDir } from "@/lib/api/fs";
import { ActionTypes, noteUid } from "@/lib/state";
import NewNoteModal from "../newNoteModal";
import Link from "next/link";
import { noteUrl } from "@/lib/urls";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "../ui/context-menu";
import { useRouter } from "next/router";
import DeleteNoteModal from "../deleteNoteModal";
import { ChevronRightIcon, ChevronDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import LoadingIcon from "../ui/loadingIcon";
import { cn } from "@/lib/utils";
import { useUrlMatch } from "../hooks/useUrlMatch";

type NoteNavItemProps = {
    stat: RemoteItem;
    storage: Storage;
    onNewNote: (stat: RemoteItem) => void;
    onMenu?: (stat: RemoteItem, e: React.MouseEvent) => void;
    depth: number;
}

const inlineButtonClass = 'p-[0.1rem] mr-1 hover:bg-muted-foreground/20 rounded-sm';

function NoteNavItem({ stat, storage, onNewNote, onMenu, depth }: NoteNavItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useAppDispatch();
    const { notes } = useAppState();

    const note: NoteItem = useMemo(() => notes[noteUid(storage.id, stat.id)], [notes, storage.id, stat.id]);

    const url = useMemo(() => noteUrl(storage.id, stat.id), [storage, stat]);

    const fetchNote = useCallback(async () => {
        if (isLoading) return;
        if (note) return;
        setIsLoading(true);
        try {
            const note = await getNoteByStat(storage, stat);
            dispatch(ActionTypes.ADD_NOTE, { note });
            return note;
        }
        catch (e: any) {
            console.error('Error fetching note', e);
        }
        finally {
            setIsLoading(false);
        }
    }, [dispatch, isLoading, note, stat, storage]);

    const toggleExpand = useCallback((e: React.MouseEvent | null) => {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        if (!isExpanded) fetchNote();
        setIsExpanded(!isExpanded);
    }, [fetchNote, isExpanded]);

    const createChildNote = useCallback(() => {
        onNewNote(stat);
        if (!isExpanded) toggleExpand(null);
    }, [isExpanded, onNewNote, stat, toggleExpand]);

    const handleMenu = useCallback((e: React.MouseEvent) => {
        if (onMenu) {
            onMenu(stat, e);
        }
    }, [onMenu, stat]);

    const isMatch = useUrlMatch();
    const matched = useMemo(() => isMatch(url), [isMatch, url]);

    return (
        <>
            <div style={{ paddingLeft: `${depth * 0.7}rem` }}
                className={cn('hover:bg-muted rounded-sm my-[0.1rem]', matched && 'bg-muted')}
            >
                <div className={cn('flex text-sm px-2 py-1 font-medium',
                    matched ? 'text-foreground/80' : 'text-foreground/70')}>
                    <Link href={url} className='noteNavItem grow flex' onContextMenu={handleMenu}>
                        <button className={inlineButtonClass} onClick={toggleExpand}>
                            {
                                isLoading
                                    ? <LoadingIcon className='w-3 h-3' />
                                    : isExpanded
                                        ? <ChevronDownIcon strokeWidth={3} className='w-3 h-3' />
                                        : <ChevronRightIcon strokeWidth={3} className='w-3 h-3' />}
                        </button>
                        {stat.name}
                    </Link>
                    <button title="New note inside" className={inlineButtonClass} onClick={createChildNote}>
                        <PlusIcon strokeWidth={3} className='w-3 h-3' />
                    </button>
                </div>
            </div>
            {
                isExpanded && note && (
                    <div>
                        {
                            note.childNoteStats.length === 0 && (
                                <div
                                    style={{ paddingLeft: `${(depth + 1) * 0.7}rem` }}
                                    className='text-xs text-muted-foreground'>
                                    No pages inside.
                                </div>
                            )
                        }
                        {note.childNoteStats.map((childStat) => (
                            <NoteNavItem key={`${storage.id}:${childStat.id}`}
                                depth={depth + 1}
                                stat={childStat}
                                storage={storage}
                                onMenu={onMenu}
                                onNewNote={onNewNote} />
                        ))}
                    </div>)
            }
        </>
    );
}

function StorageTree({ storage }: { storage: Storage }) {
    const { rootNoteStats } = useAppState();
    const [isRootLoading, setIsRootLoading] = useState(false);
    const dispatch = useAppDispatch();
    const [selectedStat, setSelectedStat] = useState<RemoteItem | undefined>(undefined);
    const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
    const router = useRouter();
    const [deleteNoteModalOpen, setDeleteNoteModalOpen] = useState(false);

    const noteStats = useMemo(() => {
        const noteStats = rootNoteStats[storage.id];
        if (!noteStats) return undefined;
        return noteStats;
    }, [rootNoteStats, storage.id]);

    const fetchNoteStats = useCallback(async (storage: Storage) => {
        if (!storage.storageMeta?.notesDir) return;
        const rootNoteStats = await readDir({
            id: storage.storageMeta.notesDir,
            storageId: storage.id,
        });
        dispatch(ActionTypes.SET_ROOT_NOTE_STATS, {
            storageId: storage.id,
            rootNoteStats,
        });
    }, [dispatch]);

    useEffect(() => {
        if (isRootLoading) return;
        if (noteStats) return;
        setIsRootLoading(true);
        fetchNoteStats(storage).finally(() => {
            setIsRootLoading(false);
        });
    }, [storage, isRootLoading, noteStats, fetchNoteStats]);


    const newChildNote = useCallback(async (stat: RemoteItem) => {
        setSelectedStat(stat);
        setIsNewNoteModalOpen(true);
    }, []);

    const newNoteFromSelected = useCallback(async () => {
        if (!selectedStat) return;
        setIsNewNoteModalOpen(true);
    }, [selectedStat]);

    const newRootNote = useCallback(async () => {
        setSelectedStat(undefined);
        setIsNewNoteModalOpen(true);
    }, []);

    const handleNoteMenu = useCallback((stat: RemoteItem, e: React.MouseEvent) => {
        setSelectedStat(stat);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        const isSidebarItem = e.target instanceof HTMLElement && e.target.closest('.noteNavItem');
        if (!isSidebarItem) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, []);

    const openSelected = useCallback(() => {
        if (!selectedStat) return;
        router.push(noteUrl(storage.id, selectedStat.id));
    }, [router, selectedStat, storage.id]);

    const deleteSelected = useCallback(() => {
        if (!selectedStat) return;
        setDeleteNoteModalOpen(true);
    }, [selectedStat]);

    return (
        <div className='py-3'>
            <NewNoteModal
                storage={storage}
                parentId={selectedStat?.id}
                isOpen={isNewNoteModalOpen}
                onOpenChange={setIsNewNoteModalOpen} />
            <DeleteNoteModal
                storage={storage}
                stat={selectedStat || null}
                isOpen={deleteNoteModalOpen}
                onOpenChange={setDeleteNoteModalOpen} />
            <div className='flex justify-between px-2'>
                <div className='text-sm font-semibold'>
                    {storage.name}
                </div>
                <button title="New Note" className={inlineButtonClass} onClick={newRootNote}>
                    <PlusIcon strokeWidth={3} className='w-3 h-3' />
                </button>
            </div>
            <ContextMenu>
                <ContextMenuTrigger onContextMenu={handleContextMenu}>
                    {
                        noteStats?.map((stat) => (
                            <NoteNavItem key={`${storage.id}:${stat.id}`}
                                depth={0}
                                onMenu={handleNoteMenu}
                                stat={stat}
                                storage={storage}
                                onNewNote={newChildNote} />
                        ))
                    }
                </ContextMenuTrigger>
                <ContextMenuContent>
                    <ContextMenuItem onClick={openSelected}>Open</ContextMenuItem>
                    <ContextMenuItem onClick={newNoteFromSelected}>Add page..</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem className='text-red-500' onClick={deleteSelected}>Delete</ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
        </div>
    );
}

export function NotesSidebar() {
    const storages = useFilterStorages(AppName.Notes);
    return (
        <div>
            {
                storages.map((storage) => <StorageTree key={storage.id} storage={storage} />)
            }
        </div>);
}
