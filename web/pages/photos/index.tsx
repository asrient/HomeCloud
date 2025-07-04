import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'

export default function Page() {
  return (
    <div className='p-5 py-10 min-h-full flex justify-center items-center flex-col'>
      <div className='text-primary text-4xl font-thin'>
        Your photos, across devices.
      </div>
      <div className='text-muted-foreground text-md mt-2'>
        Select a library to view your photos.
      </div>
      </div>
  )
}

Page.config = buildPageConfig(SidebarType.Photos)
