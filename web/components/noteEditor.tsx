import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'

export type NoteEditorProps = {
    content: string,
    setContent: (content: string) => void,
}

const NoteEditor = ({ content, setContent }: NoteEditorProps) => {
    const editor = useEditor({
        autofocus: true,
        extensions: [
            StarterKit,
        ],
        content,
        editorProps: {
            attributes: {
                class: 'focus:outline-none min-h-[70vh]',
            },
        }
    })

    useEffect(() => {
        if (!editor) return;
        const onUpdate = () => {
            setContent(editor.getHTML());
        };
        editor.on('update', onUpdate);
        return () => {
            editor.off('update', onUpdate);
        }
    }, [editor, setContent]);

    useEffect(() => {
        if (!editor) return;
        editor.commands.setContent(content);
    }, [editor, content]);

    return (
        <EditorContent
            className='w-full h-full'
            editor={editor} />
    )
}

export default NoteEditor
