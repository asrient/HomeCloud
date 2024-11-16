import Image from 'next/image'
import Head from 'next/head'
import { useEffect, useState } from 'react'
import { getGreetings } from '@/lib/utils'
import Link from 'next/link'
import { useAppState } from '@/components/hooks/useAppState'
import { AnimatePresence, motion } from 'framer-motion';

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
      <p className={`m-0 max-w-[80%] text-sm opacity-50`}>
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
    name: 'Notes',
    icon: '/icons/notes.png',
    description: 'Organize your texts into notes and wikis and store them wherever you want.',
    href: '/notes'
  },
  {
    name: 'Files',
    icon: '/icons/folder.png',
    description: 'Access and manage your files from all your storages in one place.',
    href: '/files'
  },
]

export default function Home() {
  const [greetings, setGreetings] = useState('Hi');
  const { profile } = useAppState();

  useEffect(() => {
    setGreetings(`Hi, ${getGreetings()} ${profile?.name || 'human'}.`);

    // Change the greeting text after 6 seconds
    const timer = setTimeout(() => {
      setGreetings('What do you wanna do today?');
    }, 6000);

    return () => clearTimeout(timer); // Clean up the timer on unmount
  }, [profile?.name]);

  const greetingArray = greetings.split(''); // Split the greeting text into an array of characters

  return (
    <>
      <Head>
        <title>HomeCloud</title>
      </Head>
      <main className='container'>
        <div className={`flex min-h-[70vh] justify-center flex-col pt-16 md:pt-32`}>
          <div className="flex justify-start">
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="inline-block"
            >
              <Image
                alt="HomeCloud Logo"
                src="/icons/circle.png"
                height={80}
                width={80}
                className="md:h-24 md:w-24"
              />
            </motion.div>
          </div>
          <div className="flex-col pt-10 pb-16 text-foreground/50 text-4xl lg:text-6xl font-thin">
            <AnimatePresence mode="wait">
              <motion.span
                key={greetings} // Changing key to trigger animation on text change
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                {greetingArray.map((char, index) => (
                  <motion.span
                    key={`${greetings}-${index}`} // Unique key to re-render each character
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    {char}
                  </motion.span>
                ))}
              </motion.span>
            </AnimatePresence>
          </div>
          <div className="mb-32 flex items-baseline flex-col md:grid w-full md:grid-cols-2 xl:grid-cols-3 text-left">
            {
              apps.map((app) => (
                <AppCard key={app.name} {...app} />
              ))
            }
          </div>
        </div>
      </main>
    </>
  )
}
