import { RemoteItem, Storage } from "@/lib/types";
import { useDeleteNote, useNote } from "./hooks/useNotes";
import { useCallback } from "react";
import ConfirmModal from "./confirmModal";
import { useUrlMatch } from "./hooks/useUrlMatch";
import { noteUrl, notesUrl } from "@/lib/urls";
import { useRouter } from "next/router";

export type DeleteNoteModalProps = {
    storage: Storage;
    stat: RemoteItem | null;
    isOpen: boolean;
    onOpenChange: (isOpen: boolean) => void;
};

export default function DeleteNoteModal({ storage, stat, isOpen, onOpenChange }: DeleteNoteModalProps) {
    const [deleteNote, deleteNoteLoading] = useDeleteNote();
    const [note, isLoading, err] = useNote(storage, stat && isOpen ? stat.id : null);
    const isMatch = useUrlMatch();
    const router = useRouter();

    const handleDelete = useCallback(async () => {
        if (!note) {
            throw new Error(err || 'Note not found');
        }
        const url = noteUrl(storage.id, note.stat.id);
        const isRoot = note.isRootNote;
        const parentId = note.stat.parentIds?.[0];
        await deleteNote(note);
        if (isMatch(url)) {
            if (isRoot || !parentId) {
                router.replace(notesUrl());
            } else {
                router.replace(noteUrl(storage.id, parentId));
            }
        }
    }, [deleteNote, err, isMatch, note, router, storage.id]);

    return (
        <ConfirmModal
            title={`Delete "${stat?.name}"?`}
            description="Deleting this note will delete all the files and pages inside."
            isOpen={isOpen && !!note}
            onOpenChange={onOpenChange}
            onConfirm={handleDelete}
            buttonText="Delete"
            buttonVariant='destructive'
        />
    );
}
