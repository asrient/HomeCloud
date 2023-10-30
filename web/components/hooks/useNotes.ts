import { useAppDispatch, useAppState } from "../hooks/useAppState";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateNoteParams, createNote, renameNoteTitle, deleteNote, getNoteById, fetchNoteContent, setNoteContent } from "@/lib/noteUtils";
import { ActionTypes, noteUid } from "@/lib/state";
import { NoteItem, Storage } from "@/lib/types";

export function useNewNote() {
    const dispatch = useAppDispatch();
    const [isLoading, setIsLoading] = useState(false);

    const func = useCallback(async (params: CreateNoteParams) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const note = await createNote(params);
            dispatch(ActionTypes.ADD_NOTE, { note });
            return note;
        } finally {
            setIsLoading(false);
        }
    }, [dispatch, isLoading]);

    return [func, isLoading] as const;
}

export function useRenameNote() {
    const dispatch = useAppDispatch();
    const [isLoading, setIsLoading] = useState(false);

    const func = useCallback(async (note: NoteItem, newName: string) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const resp = await renameNoteTitle(note, newName);
            dispatch(ActionTypes.RENAME_NOTE, resp);
            return resp;
        } finally {
            setIsLoading(false);
        }
    }, [dispatch, isLoading]);

    return [func, isLoading] as const;
}

export function useDeleteNote() {
    const dispatch = useAppDispatch();
    const [isLoading, setIsLoading] = useState(false);

    const func = useCallback(async (note: NoteItem) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const resp = await deleteNote(note);
            dispatch(ActionTypes.REMOVE_NOTE, resp);
        } finally {
            setIsLoading(false);
        }
    }, [dispatch, isLoading]);

    return [func, isLoading] as const;
}

export function useNote(storage: Storage | null, id: string | null) {
    const dispatch = useAppDispatch();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { notes } = useAppState();
    const uidRef = useRef<string | null>(null);

    const note = useMemo(() => {
        if (storage === null || id === null) return null;
        const uid_ = noteUid(storage.id, id);
        if (notes[uid_]) return notes[uid_];
        return null;
    }, [notes, storage, id]);

    uidRef.current = storage && id ? noteUid(storage.id, id) : null;

    const fetchNote = useCallback(async () => {
        if (!storage || typeof id !== 'string') return;
        console.log('fetchNote', storage.id, id)
        setIsLoading(true);
        setError(null);
        try {
            const note = await getNoteById(storage, id);
            dispatch(ActionTypes.ADD_NOTE, { note });
        } catch (e: any) {
            if (uidRef.current === noteUid(storage.id, id)) {
                console.error(e);
                setError(e.message);
            }
        } finally {
            setIsLoading(false);
        }
    }, [storage, id, dispatch]);

    useEffect(() => {
        if (note) return;
        if (storage === null || id === null) return;
        if (isLoading) return;
        if (error !== null) return;
        fetchNote();
    }, [note, fetchNote, storage, id, isLoading, error]);

    useEffect(() => {
        if (note !== null) {
            setError(null);
        }
    }, [note]);

    useEffect(() => {
        setError(null);
    }, [storage, id]);

    return [note, isLoading, error] as const;
}

export function useNoteContent(note: NoteItem | null) {
    const [content, setContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const uid = useRef<string | null>(null);

    useEffect(() => {
        if (note === null) {
            setContent('');
            uid.current = null;
            setError(null);
            return;
        }
        if (uid.current === noteUid(note.storageId, note.stat.id)) return;
        uid.current = noteUid(note.storageId, note.stat.id);
        setIsLoading(true);
        setError(null);
        fetchNoteContent(note)
            .then((content) => {
                setContent(content);
            })
            .catch((e) => {
                setError(e.message);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [note]);

    const setContentFunc = useCallback(async (content: string) => {
        if (note === null) return;
        await setNoteContent(note, content);
        setContent(content);
    }, [note]);

    return [content, setContentFunc, isLoading, error] as const;
}
