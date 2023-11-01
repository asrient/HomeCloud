import Head from 'next/head'
import { buildPageConfig } from '@/lib/utils'
import { SidebarType } from "@/lib/types"
import type { NextPageWithConfig } from '../_app'
import PageBar from '@/components/pageBar'
import { AppName } from "@/lib/types";
import useFilterStorages from "@/components/hooks/useFilterStorages";
import NewNoteModal from '@/components/newNoteModal'
import { Button } from '@/components/ui/button'
import { DocumentPlusIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline'

const Page: NextPageWithConfig = () => {
    const storages = useFilterStorages(AppName.Notes);

    return (
        <>
            <Head>
                <title>Notes</title>
            </Head>
            <PageBar icon='/icons/notes.png' title='Notes'>
            </PageBar>
            <main className='container max-w-5xl min-h-[90vh] flex flex-col justify-center'>
                <div className='min-h-[40rem] max-h-[90vh]'>
                    <h1 className='py-4 text-6xl font-bold text-slate-400'>
                        Your notes. Organized.
                    </h1>
                    <hr />
                    <div className='mt-8'>
                        {storages.length > 0 && <NewNoteModal
                            storage={storages[0]}
                        >
                            <Button className='text-blue-500' variant='link'>
                                <DocumentPlusIcon className='w-6 h-6 mr-2' />
                                Create a new note...
                            </Button>
                        </NewNoteModal>}
                        <a href='#'>
                            <Button className='text-blue-500' variant='link'>
                                <QuestionMarkCircleIcon className='w-6 h-6 mr-2' />
                                Learn more about notes
                            </Button>
                        </a>
                    </div>
                </div>
            </main>
        </>
    )
}

Page.config = buildPageConfig(SidebarType.Notes)
export default Page
