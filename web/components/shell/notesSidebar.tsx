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
import { ChevronRightIcon, ChevronDownIcon, PlusIcon, ServerIcon } from "@heroicons/react/24/outline";
import LoadingIcon from "../ui/loadingIcon";
import { cn, isMobile } from "@/lib/utils";
import { useUrlMatch } from "../hooks/useUrlMatch";
import { useToast } from "../ui/use-toast";
import useHideSidebar from "../hooks/useHideSidebar";

type NoteNavItemProps = {
    stat: RemoteItem;
    storage: Storage;
    onNewNote: (stat: RemoteItem) => void;
    onMenu?: (stat: RemoteItem, e: React.MouseEvent) => void;
    depth: number;
}

const inlineButtonClass = 'p-[0.1rem] mr-1 text-muted-foreground/60 hover:bg-muted-foreground/20 rounded-sm';

function NoteNavItem({ stat, storage, onNewNote, onMenu, depth }: NoteNavItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const dispatch = useAppDispatch();
    const { notes } = useAppState();
    const [isError, setIsError] = useState(false);
    const hideSidebar = useHideSidebar();

    const note: NoteItem = useMemo(() => notes[noteUid(storage.id, stat.id)], [notes, storage.id, stat.id]);

    const url = useMemo(() => noteUrl(storage.id, stat.id), [storage, stat]);

    const fetchNote = useCallback(async () => {
        if (isLoading) return;
        if (note) return;
        setIsLoading(true);
        setIsError(false);
        try {
            const note = await getNoteByStat(storage, stat);
            dispatch(ActionTypes.ADD_NOTE, { note });
            return note;
        }
        catch (e: any) {
            console.error('Error fetching note', e);
            setIsError(true);
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

    const onLinkClick = useCallback((e: React.MouseEvent) => {
        if (isMobile()) {
            hideSidebar();
        }
    }, [hideSidebar]);

    return (
        <>
            <div style={{ paddingLeft: `${depth * 0.7}rem` }}
                className={cn('hover:bg-muted group rounded-sm my-[0.1rem]', matched && 'bg-muted')}
            >
                <div className={cn('flex text-sm px-2 py-1 font-medium',
                    isError
                        ? 'text-red-500'
                        : matched
                            ? 'text-foreground/80'
                            : 'text-foreground/70')}>
                    <Link href={url} onClick={onLinkClick} className='noteNavItem grow flex' onContextMenu={handleMenu}>
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
                    <button title="New note inside" className={cn(inlineButtonClass, 'opacity-0 group-hover:opacity-100')} onClick={createChildNote}>
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
    const [isError, setIsError] = useState(false);
    const dispatch = useAppDispatch();
    const [selectedStat, setSelectedStat] = useState<RemoteItem | undefined>(undefined);
    const [isNewNoteModalOpen, setIsNewNoteModalOpen] = useState(false);
    const router = useRouter();
    const [deleteNoteModalOpen, setDeleteNoteModalOpen] = useState(false);
    const { toast } = useToast();

    const noteStats = useMemo(() => {
        const noteStats = rootNoteStats[storage.id];
        if (!noteStats) return undefined;
        return noteStats;
    }, [rootNoteStats, storage.id]);

    const fetchNoteStats = useCallback(async (storage: Storage) => {
        if (isRootLoading) return;
        if (isError) return;
        if (!storage.storageMeta?.notesDir) {
            setIsError(true);
            return;
        }
        setIsRootLoading(true);
        try {
            let rootNoteStats = await readDir({
                id: storage.storageMeta.notesDir,
                storageId: storage.id,
            });
            rootNoteStats = rootNoteStats.filter((stat) => stat.type === 'directory');
            dispatch(ActionTypes.SET_ROOT_NOTE_STATS, {
                storageId: storage.id,
                rootNoteStats,
            });
        } catch (e: any) {
            console.error('Error fetching note stats', e);
            toast({
                title: `${storage.name} notes`,
                description: e.message,
                variant: 'destructive',
            });
            setIsError(true);
        } finally {
            setIsRootLoading(false);
        }
    }, [dispatch, isError, isRootLoading, toast]);

    useEffect(() => {
        if (noteStats) return;
        fetchNoteStats(storage);
    }, [noteStats, fetchNoteStats, storage]);

    useEffect(() => {
        setIsError(false);
    }, [storage.id, storage.storageMeta?.notesDir]);

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
        <div className='my-2 py-1 px-1 border-b border-muted'>
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
                <div className={cn(isError && 'text-red-500')}>
                    <ServerIcon className='w-4 h-4 inline-block' />
                    <span className='ml-2 text-sm font-semibold'>
                        {storage.name}
                    </span>
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
        <div className='mb-2 mt-6'>
            <h2 className="mb-2 px-4 text-lg font-semibold tracking-tight">
                Collections
            </h2>
            {
                storages.map((storage) => <StorageTree key={storage.id} storage={storage} />)
            }
        </div>);
}
