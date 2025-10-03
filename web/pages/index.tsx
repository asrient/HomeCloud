import Image from 'next/image'
import Head from 'next/head'
import Link from 'next/link'
import { PageBar, PageContent } from "@/components/pagePrimatives";
import { ThemedIconName } from '@/lib/enums'

type AppProps = { name: string, icon: string, description?: string, href: string };

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
      <h2 className={`mb-3 text-xl font-semibold`}>
        {name}
        <span className="ml-3 inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </span>
      </h2>
      {description && <p className={`m-0 max-w-[80%] text-sm opacity-50`}>
        {description}
      </p>}
    </div>
  </Link>)
}

const apps: AppProps[] = [
  {
    name: 'Photos',
    icon: '/icons/photos.png',
    href: '/photos'
  },
  {
    name: 'Files',
    icon: '/icons/folder.png',
    href: '/files'
  },
]

export default function Home() {

  return (
    <>
      <Head>
        <title>Media Center</title>
      </Head>

      <PageBar icon={ThemedIconName.Home} title='My Media'>
      </PageBar>
      <PageContent>
        <div className="mx-8 my-4 items-baseline grid md:grid-cols-2 xl:grid-cols-3 text-left">
          {
            apps.map((app) => (
              <AppCard key={app.name} {...app} />
            ))
          }
        </div>
      </PageContent>
    </>
  )
}
