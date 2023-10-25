import { SettingsSidebar } from '@/components/shell/settingsSidebar'
import Head from 'next/head'
import Image from 'next/image'


export default function Page() {

  return (
    <>
      <Head>
        <title>Settings</title>
      </Head>
      <main className='bg-slate-100 p-6 min-h-[96vh]'>
        <div className='max-w-lg mx-auto '>
          <div className='py-5 text-2xl font-bold px-6 flex items-center'>
            <Image src='/icons/settings.png' alt='settings icon' width={50} height={50} className='mr-2' />
            Settings
          </div>
          <div className='bg-background p-1 py-3 rounded-lg shadow-sm'>
            <SettingsSidebar />
          </div>
        </div>

      </main>
    </>
  )
}
