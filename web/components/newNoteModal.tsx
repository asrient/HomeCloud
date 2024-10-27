import TextModal, { TextModalProps } from "./textModal";
import { Storage } from "@/lib/types";
import { useNewNote } from "./hooks/useNotes";
import { useCallback } from "react";
import { noteUrl } from "@/lib/urls";
import { useRouter } from "next/router";
import { getNotesDir } from "@/lib/noteUtils";

export type NewNoteModalProps = {
    storage: Storage;
    parentId?: string;
} & Pick<TextModalProps, 'children' | 'isOpen' | 'onOpenChange' | 'noTrigger'>;

export default function NewNoteModal({ storage, parentId, ...props }: NewNoteModalProps) {
    const [createNote, newNoteLoading] = useNewNote();
    const router = useRouter();

    const handleDone = useCallback(async (name: string) => {
        const parentId_ = parentId || getNotesDir();
        if (!parentId_) return;
        const newNote = await createNote({
            title: name,
            parentId: parentId_,
            storage,
            content: '',
        });
        if (newNote) {
            router.push(noteUrl(storage.id, newNote.stat.id));
        }
    }, [createNote, parentId, router, storage]);

    return (
        <TextModal
            {...props}
            title='Create a new Note'
            fieldName='Name'
            onDone={handleDone}
            buttonText="Create"
        />
    );
}
