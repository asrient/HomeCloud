import { useAppDispatch, useAppState } from '@/components/hooks/useAppState'
import PageBar from '@/components/pageBar'
import { PageContainer, Section, Line } from '@/components/settingsView'
import { Button } from '@/components/ui/button'
import { ActionTypes } from '@/lib/state'
import { getName } from '@/lib/storageConfig'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import { Switch } from "@/components/ui/switch"
import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useCallback, useMemo, useState } from 'react'
import AddStorageModal from '@/components/addStorageModal'
import { DialogTrigger } from '@/components/ui/dialog'
import { serviceScan, deleteStorage } from '@/lib/api/storage'
import { useToast } from '@/components/ui/use-toast'
import LoadingIcon from '@/components/ui/loadingIcon'
import ConfirmModal from '@/components/confirmModal'
import { settingsUrl } from '@/lib/urls'


function Page() {
  const router = useRouter();
  const { storages, disabledStorages } = useAppState();
  const { id } = router.query as { id?: string };
  const storageId = useMemo(() => id ? parseInt(id) : null, [id]);
  const storage = useMemo(() => storages && storages.find((s) => s.id == storageId), [storages, storageId]);
  const dispatch = useAppDispatch();

  const isDisabled = useMemo(() => {
    if (!storage) return false;
    return disabledStorages.includes(storage.id);
  }, [storage, disabledStorages]);

  const onToggle = (checked: boolean) => {
    storage && dispatch(ActionTypes.TOGGLE_STORAGE, {
      storageId: storage.id,
      disabled: !checked,
    });
  }

  const [isStorageMetaLoading, setIsStorageMetaLoading] = useState(false);
  const { toast } = useToast();

  const onScanButtonClick = useCallback(async () => {
    if (!storage) return;
    if (isStorageMetaLoading) return;
    setIsStorageMetaLoading(true);
    try {
      const storageMeta = await serviceScan({
        storageId: storage.id,
        force: true,
      });
      dispatch(ActionTypes.ADD_STORAGE_META, { storageId: storage.id, storageMeta });
    } catch (e: any) {
      console.error(e);
      toast({
        variant: "destructive",
        title: storage.storageMeta ? `Could not re-scan "${storage.name}"` : 'Could not enable HomeCloud services',
        description: e.message,
      });
    } finally {
      setIsStorageMetaLoading(false);
    }
  }, [dispatch, isStorageMetaLoading, storage, toast]);

  const performDelete = useCallback(async () => {
    if (!storage) return;
    const { storageId } = await deleteStorage(storage.id);
    dispatch(ActionTypes.REMOVE_STORAGE, { storageId });
    router.push(settingsUrl());
  }, [dispatch, router, storage]);

  return (
    <>
      <Head>
        <title>Storage Settings</title>
      </Head>
      <main>
        <PageBar icon='/icons/settings.png' title={storage?.name || 'Storage'}>
        </PageBar>
        {
          !storage && !storageId && (
            <div className='flex justify-center items-center min-h-[20rem] p-2'>
              Invalid Storage.
            </div>)
        }
        {
          storage && (
            <PageContainer>
              <div className='mt-6 mb-10 flex justify-center'>
                <Image src='/icons/ssd.png' alt='storage icon' width={80} height={80} />
              </div>
              <Section>
                <Line title='Enabled'>
                  <Switch
                    className="ml-2 my-auto"
                    checked={!isDisabled}
                    onCheckedChange={onToggle} />
                </Line>
              </Section>

              <AddStorageModal existingStorage={storage} >
                <Section>
                  <Line title='Name'>
                    <DialogTrigger>
                      {storage.name}
                    </DialogTrigger>
                  </Line>
                  <Line title='Type'>
                    {getName(storage.type)}
                  </Line>
                  <Line>
                    <DialogTrigger asChild>
                      <Button variant='ghost' className='text-blue-500' size='sm'>
                        Edit Connection...
                      </Button>
                    </DialogTrigger>
                  </Line>
                </Section>
              </AddStorageModal>

              <Section>
                <Line title='HomeCloud services'>
                  <Button
                    onClick={onScanButtonClick}
                    disabled={isStorageMetaLoading}
                    variant={storage.storageMeta ? 'outline' : 'default'}
                    size='sm'>
                    {
                      isStorageMetaLoading
                        ? <LoadingIcon />
                        : storage.storageMeta
                          ? 'Scan'
                          : 'Enable'}
                  </Button>
                </Line>
              </Section>

              <Section>
                <Line>
                  <ConfirmModal
                    title={`Remove "${storage.name}"?`}
                    description={`Your files won't be deleted from the storage, but certain data like favorites and tags not stored in the storage will be lost.`}
                    onConfirm={performDelete}
                    buttonVariant='destructive'
                  >
                    <Button variant='ghost' className='text-red-500' size='sm'>
                      Delete Storage...
                    </Button>
                  </ConfirmModal>
                </Line>
              </Section>
            </PageContainer>
          )
        }
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Settings)
export default Page
