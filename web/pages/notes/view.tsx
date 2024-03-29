import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { SidebarType } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import { useRouter } from 'next/router'
import { useNote, useNoteContent, useRenameNote } from '@/components/hooks/useNotes'
import { useCallback, useEffect, useMemo, useState } from 'react'
import LoadingIcon from '@/components/ui/loadingIcon'
import { noteUrl } from '@/lib/urls'
import NoteEditor from '@/components/noteEditor'

const Page: NextPageWithConfig = () => {

    const router = useRouter();
    const { s, id } = router.query as { s: string | undefined, id: string | undefined };
    const storages = useFilterStorages(AppName.Notes);

    const storage = useMemo(() => {
        const storageId = s ? parseInt(s) : null;
        if (!storageId || !storages) return null;
        return storages.find(s => s.id === storageId) || null;
    }, [s, storages]);

    const [note, isLoading, err] = useNote(storage, id || null);
    const [content, setContent, contentFetching, contentErr] = useNoteContent(note);
    const [renameNote, renameNoteLoading] = useRenameNote();
    const [nameInputValue, setNameInputValue] = useState<string>('');
    const [renameErr, setRenameErr] = useState<string | null>(null);
    const [unsavedContent, setUnsavedContent] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    useEffect(() => {
        const update = async () => {
            if (!unsavedContent) return;
            setIsSaving(true);
            setSaveErr(null);
            try {
                await setContent(unsavedContent);
            } catch (e: any) {
                console.error('Error saving note', e);
                setSaveErr(e.message);
            }
            setIsSaving(false);
            setUnsavedContent(null);
        }
        const timer = setTimeout(update, 3000);
        return () => {
            clearTimeout(timer);
        }
    }, [setContent, unsavedContent]);

    useEffect(() => {
        if (!note) return;
        setNameInputValue(note.stat.name);
    }, [note]);

    const onNameInputBlur = useCallback(async () => {
        const newVal = nameInputValue.trim();
        if (!note || note.stat.name.trim() === newVal || newVal.length === 0) return;
        setRenameErr(null);
        try {
            const resp = await renameNote(note, newVal);
            if (resp && storage && resp.newId !== resp.oldId) {
                router.replace(noteUrl(storage.id, resp.newId), undefined, { shallow: true });
            }
        }
        catch (e: any) {
            console.error('Error renaming note', e);
            setRenameErr(e.message);
        }
    }, [nameInputValue, note, renameNote, router, storage]);

    const handleSetContent = useCallback((content: string) => {
        if (!note) return;
        setUnsavedContent(content);
    }, [note]);

    return (
        <>
            <Head>
                <title>{
                    `${note ? note.stat.name : 'Note'} - Notes`
                }</title>
            </Head>
            <PageBar icon='/icons/notes.png' title={
                note ? note.stat.name : 'Loading note...'
            }>
                <div className='font-medium text-xs text-muted-foreground flex items-center justify-center px-3 py-1 bg-muted rounded-full'>
                    {
                        isSaving ? (
                            <>
                                <LoadingIcon className='w-3 h-3 mr-1' />
                                <span>Saving</span>
                            </>)
                            : unsavedContent ? <span className='italic'>Modified</span>
                                : saveErr
                                    ? <span className='text-red-500'>Error</span>
                                    : 'Saved'
                    }
                </div>

            </PageBar>
            <main className='min-h-[90vh]'>
                {
                    isLoading || err ? (
                        <div className='flex flex-col items-center justify-center w-full h-full p-10 min-h-[20rem] text-xs text-foreground/50'>
                            {!err && <LoadingIcon className='w-5 h-5 mb-2' />}
                            {
                                isLoading ?
                                    <div>Loading..</div>
                                    : <div>
                                        <div className='text-lg text-foreground'>Failed to load note.</div>
                                        {err}
                                    </div>
                            }
                        </div>
                    )
                        : (
                            <div className='container max-w-5xl'>
                                <div className=' my-3'>
                                    <div className='pt-4 sm:pt-8 flex flex-col border-b border-foreground/20'>
                                        <input
                                            disabled={renameNoteLoading}
                                            onBlur={onNameInputBlur}
                                            onChange={e => setNameInputValue(e.target.value)}
                                            value={nameInputValue}
                                            className='py-2 w-full text-2xl sm:text-4xl text-foreground/90 font-bold' />
                                    </div>
                                    {(renameNoteLoading || renameErr)
                                        && <div className='w-full flex py-2 px-3 bg-muted text-muted-foreground text-sm font-medium'>
                                            {renameNoteLoading && <LoadingIcon className='w-4 h-4 mr-2' />}
                                            {renameErr || 'Updating name...'}
                                        </div>}
                                </div>

                                {
                                    (contentFetching || contentErr) ? (
                                        <div className='flex flex-col items-center justify-center w-full h-full p-10 min-h-[20rem]'>
                                            {contentErr ? <div className='text-sm font-medium'>
                                                <div className='text-lg text-foreground'>Failed to load content.</div>
                                                <div>{contentErr}</div>
                                            </div> : <LoadingIcon className='w-4 h-4 text-foreground/50' />}
                                        </div>
                                    )
                                        : (
                                            <NoteEditor
                                                content={content}
                                                setContent={handleSetContent} />
                                        )
                                }
                            </div>
                        )
                }
            </main>
        </>
    )
}

Page.config = buildPageConfig(SidebarType.Notes)
export default Page
