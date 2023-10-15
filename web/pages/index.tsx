import Image from 'next/image'
import { Inter } from 'next/font/google'
import Head from 'next/head'
import { useMemo } from 'react'
import { getGreetings } from '@/lib/utils'
import Link from 'next/link'

const inter = Inter({ subsets: ['latin'] })

type AppProps = { name: string, icon: string, description: string, href: string };

function AppCard({ name, icon, href, description }: AppProps) {
  return (<Link
    href={href}
    className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
  >
    <div>
      <Image
        alt={name}
        src={icon}
        loading="eager"
        height={0}
        width={0}
        className="h-12 w-12 mb-3"
      />
    </div>
    <div>
      <h2 className={`mb-3 text-2xl font-semibold`}>
        {name}
        <span className="ml-3 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </span>
      </h2>
      <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
        {description}
      </p>
    </div>
  </Link>)
}

const apps: AppProps[] = [
  {
    name: 'Photos',
    icon: '/icons/photos.png',
    description: 'Free your photos. Same features and experience, no matter where they are stored.',
    href: '/photos'
  },
  {
    name: 'Files',
    icon: '/icons/folder.png',
    description: 'Access and manage your files from all your storages in one place.',
    href: '/files'
  },
  {
    name: 'Notes',
    icon: '/icons/notes.png',
    description: 'Organize your texts into notes and wikis and store them wherever you want.',
    href: '/notes'
  },
]

export default function Home() {
  const greetings = useMemo(getGreetings, []);

  return (
    <>
      <Head>
        <title>Start | Homecloud</title>
      </Head>
      <main className='bg-slate-50 home-bg min-h-screen pb-10'>
        <div className='container'>
          <div className={`flex min-h-[70vh] justify-center flex-col lg:flex-row lg:space-x-12 lg:items-end pt-16 ${inter.className}`}>
            <div className="flex-col pb-32 text-slate-400">
              <div className='pb-2 text-3xl pl-3 font-bold'>
                Hey,
              </div>
              <div className="max-w-xl text-5xl md:text-8xl font-bold">
                {greetings}.
              </div>
            </div>

            <div>
              <div className='text-xl p-4 font-light'>
                Let's Start
              </div>
              <div className="mb-32 flex items-baseline flex-col md:grid w-full md:grid-cols-2 xl:grid-cols-3 text-left">
                {
                  apps.map((app) => (
                    <AppCard key={app.name} {...app} />
                  ))
                }
              </div>
            </div>
          </div>
          <hr/>
          <div className='p-2 pt-4 text-sm opacity-50'>
            <div className='max-w-[45rem]'>
            <b className='text-orange-600'>HomeCloud</b> is a personal media management solution that puts you in control of your data. 
            With HomeClould you no longer need to rely on a single cloud storage provider for things like photos, notes, files. 
            You can keep or move your data into which every service you want (even external drives) and still get the same seemless experience.
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
