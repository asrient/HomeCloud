import Head from 'next/head'
import Image from 'next/image'
import { buildPageConfig } from '@/lib/utils'
import { PageBar, PageContent } from "@/components/pagePrimatives";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { useMemo, useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import LoadingIcon from '@/components/ui/loadingIcon'
import { printFingerprint, getUrlFromIconKey } from '@/lib/utils'
import { ConnectionInfo, PeerInfo, ServiceDocTree, ServiceDoc, MethodInfo } from 'shared/types'
import ServiceController from 'shared/services/controller'
import { ThemedIconName } from '@/lib/enums';

// Take parameters for the func call from userand execute the function located by the FQN and display the result.
function FunctionPlayground({ fqn, serviceController }:
  {
    fqn: string;
    serviceController: any;
  }) {
  const [params, setParams] = useState<string>('[]');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExecute = useCallback(async () => {
    try {
      const paramsArray = JSON.parse(params || '[]');
      // iterate through the serviceController to find the function by FQN
      const parts = fqn.split('.');
      // remove the last part if it is a function name
      const funcName = parts.pop();
      if (!funcName) {
        throw new Error('Function name is required in FQN');
      }
      let obj = serviceController;
      for (const part of parts) {
        if (typeof obj !== 'object') {
          throw new Error(`FQN ${fqn} is not valid, ${part} is not an object`);
        }
        if (part in obj) {
          obj = obj[part];
        } else {
          throw new Error(`Object ${part} not found in FQN ${fqn}`);
        }
      }
      if (typeof obj[funcName] !== 'function') {
        throw new Error(`FQN ${fqn} does not point to a function`);
      }
      // Call the function with the parameters
      const res = await obj[funcName](...paramsArray);
      setResult(res);
      setError(null);
    } catch (err: any) {
      console.error('Error executing function:', err);
      setError(err.message || 'An error occurred');
      setResult(null);
    }
  }, [fqn, params, serviceController]);

  return (
    <div className='p-2'>
      <div className='mb-2'>
        <textarea
          className='w-full p-2 border rounded-md min-h-[150px]'
          placeholder='Enter parameters as JSON'
          value={params}
          onChange={(e) => setParams(e.target.value)}
        />
      </div>
      <Button
        size='lg'
        variant='default'
        onClick={handleExecute}
        disabled={!fqn || !serviceController}
      >
        Execute
      </Button>
      {result && (
        <div className='mt-4 p-2 bg-green-100 text-green-800 rounded-md overflow-y-auto select-text'>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {error && (
        <div className='mt-4 p-2 bg-red-100 text-red-800 rounded-md overflow-y-auto select-text'>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}

function FunctionConsole({ doc, name, serviceController
}: {
  doc: ServiceDoc;
  name: string;
  serviceController: ServiceController | null;
}) {
  const methodInfo = doc.methodInfo;
  const description = doc.description || 'No description available';

  return (
    <div className='p-2 text-sm'>
      <div className='text-gray-500'>{description}</div>
      <div className='mt-2'>
        <span className='font-semibold'>Method Info:</span>
        <ul className='list-disc pl-4'>
          {methodInfo && (
            <>
              <li>FQN: {doc.fqn || 'N/A'}</li>
              <li>Exposed: {methodInfo.isExposed ? 'Yes' : 'No'}</li>
              <li>Allow All: {methodInfo.isAllowAll ? 'Yes' : 'No'}</li>
              <li>Pass Context: {methodInfo.passContext ? 'Yes' : 'No'}</li>
            </>
          )}
        </ul>
      </div>
      <FunctionPlayground fqn={doc.fqn || name} serviceController={serviceController} />
    </div>
  );
}

function ErrorDoc({ doc, name }: {
  doc: ServiceDoc;
  name: string;
}) {
  return (
    <div className='p-2 text-sm'>
      <div className='font-semibold'>{name}</div>
      <div className='text-red-500/50'>Error: {doc.description || 'No description available'}</div>
    </div>
  );
}

function ServiceFragment({
  docTree, name, serviceController
}: {
  docTree: ServiceDocTree;
  name: string;
  serviceController: ServiceController | null;
}) {

  const entries = Object.entries(docTree);
  if (entries.length === 0) {
    return (
      <div className='p-2 text-sm'>
        <div className='font-normal'>{name}</div>
        <div className='text-gray-500'>Empty Object</div>
      </div>
    );
  }

  return (
    <Accordion type="single" collapsible className='w-full p-3 rounded-lg shadow-sm bg-muted/30 dark:bg-foreground/5'>
      {
        entries.map(([key, value]) => {
          const type: string = String(value.__doctype__ || 'tree');
          const methodInfo: MethodInfo = (value.methodInfo as MethodInfo) || null;
          return (
            <AccordionItem key={key} value={`item-${key}`}>
              <AccordionTrigger className='w-full'>
                <div className='text-sm font-normal'>
                  <span>{key}</span>
                  <span className='text-blue-500 text-xs ml-2 border border-blue-500 px-1 rounded-md'>{type}</span>
                  {
                    methodInfo && methodInfo.isExposed && (
                      <span className='text-green-500 text-xs ml-2 border border-green-500 px-1 rounded-md'>Exposed</span>
                    )
                  }
                  {
                    methodInfo && methodInfo.isAllowAll && (
                      <span className='text-yellow-500 text-xs ml-2 border border-yellow-500 px-1 rounded-md'>Allow All</span>
                    )
                  }
                </div>

              </AccordionTrigger>
              <AccordionContent>
                {type === 'function' && <FunctionConsole doc={value as ServiceDoc} name={key} serviceController={serviceController} />}
                {type === 'error' && <ErrorDoc doc={value as ServiceDoc} name={key} />}
                {type === 'tree' && <ServiceFragment serviceController={serviceController} docTree={value as ServiceDocTree} name={key} />}
              </AccordionContent>
            </AccordionItem>
          )
        })
      }
    </Accordion>
  )
}

type DeviceCandidate = {
  fingerprint: string;
  deviceName: string | null;
}

function DeviceSelector({ setDeviceCandidate }: {
  setDeviceCandidate: (deviceCandidate: DeviceCandidate | null) => void;
}) {
  const [fingerprint, setFingerprint] = useState<string>('');
  const [connectedDevices, setConnectedDevices] = useState<ConnectionInfo[]>([]);
  const [peers, setPeers] = useState<PeerInfo[]>([]);

  useEffect(() => {
    const fetchDevices = async () => {
      const sc = window.modules.getLocalServiceController();
      const devices = await sc.net.getConnectedDevices();
      setConnectedDevices(devices);
      const peers = sc.app.getPeers();
      setPeers(peers);
    }
    fetchDevices();
  }, []);

  const handleConnect = () => {
    if (!fingerprint.trim()) {
      alert('Please enter a valid fingerprint');
      return;
    }
    setDeviceCandidate({
      fingerprint: fingerprint.trim(),
      deviceName: null,
    })
  };

  return (
    <div>

      <div className='flex items-center justify-between mb-2'>
        <div className='text-sm'>
          This Device
        </div>
        <Button
          size='sm'
          variant='secondary'
          onClick={() => setDeviceCandidate(null)}
        >
          Select
        </Button>
      </div>
      <hr />
      <div className='py-2 text-xs text-foreground/60'>MY DEVICES</div>
      {
        peers.map((device) => (
          <div key={device.fingerprint} className='flex items-center justify-between mb-2'>
            <div className='flex items-center space-x-2 pr-6'>
              <Image
                src={getUrlFromIconKey(device.iconKey)}
                alt={device.iconKey || 'Unknown Device'}
                width={40}
                height={40}
              />
              <div className='text-sm'>
                <div>{device.deviceName || 'Unknow Device'}</div>
                <div className='text-[0.8rem] text-foreground/60'>{printFingerprint(device.fingerprint)}</div>
              </div>
            </div>

            <Button
              size='sm'
              variant='secondary'
              onClick={() => setDeviceCandidate({ fingerprint: device.fingerprint, deviceName: device.deviceName })}
            >
              Select
            </Button>
          </div>
        ))
      }
      <hr />
      <div className='py-2 text-xs text-foreground/60'>CONNECTED</div>
      {
        connectedDevices.map((device) => (
          <div key={device.fingerprint} className='flex items-center justify-between mb-2'>
            <div className='text-sm'>
              <div>{device.deviceName || 'Unknow Device'}</div>
              <div className='text-[0.8rem] text-foreground/60'>{printFingerprint(device.fingerprint)}</div>
            </div>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => setDeviceCandidate({ fingerprint: device.fingerprint, deviceName: device.deviceName })}
            >
              Select
            </Button>
          </div>
        ))
      }
      <hr />
      <div className='flex items-center space-x-2 my-4'>
        <input
          type='text'
          placeholder='Fingerprint'
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value.trim())}
          className='p-2 border rounded-md flex-grow'
        />
        <Button onClick={handleConnect}>Connect</Button>
      </div>
    </div>
  );
}

function Page() {

  const servicesDoc = useMemo(() => {
    const sc = window.modules.getLocalServiceController()
    return sc.getDoc();
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [serviceController, setServiceController] = useState<ServiceController | null>(null);
  const [deviceCandidate, setDeviceCandidate] = useState<DeviceCandidate | null>(null);
  const [showDeviceSelector, setShowDeviceSelector] = useState<boolean>(false);

  useEffect(() => {
    async function loadServiceController() {
      if (!deviceCandidate) {
        const sc = window.modules.getLocalServiceController();
        setServiceController(sc);
      } else {
        try {
          const sc = await window.modules.getRemoteServiceController(deviceCandidate.fingerprint);
          setServiceController(sc);
        } catch (err: any) {
          console.error('Error getting remote service controller:', err);
          setError(err.message || 'An error occurred while fetching the remote service controller');
          setServiceController(null);
        }
      }
    }
    loadServiceController();
  }, [deviceCandidate]);

  return (
    <>
      <Head>
        <title>Playground</title>
      </Head>
      
        <PageBar icon={ThemedIconName.Tool} title='Debug Services'>
          <div className='text-sm text-foreground mr-3'>
            {deviceCandidate ? deviceCandidate.deviceName || printFingerprint(deviceCandidate.fingerprint) : 'This Device'}
          </div>
          <Button
            size='sm'
            variant='secondary'
            disabled={!serviceController && !error}
            onClick={() => setShowDeviceSelector(true)}
          >
            {
              (serviceController || error) ? 'Switch' : (
                <LoadingIcon className='text-sm' />
              )
            }
          </Button>
        </PageBar>
        <PageContent className='container py-5'>
        {
          error && (<div className='text-xs text-red-700 bg-red-300 rounded-md p-2 mb-4'>
            {error}
          </div>)
        }
        <ServiceFragment docTree={servicesDoc} serviceController={serviceController} name='Local Service Controller' />
      </PageContent>
      <Sheet
        open={showDeviceSelector}
        onOpenChange={setShowDeviceSelector}>
        <SheetContent className="w-[600px]">
          <SheetHeader>
            <SheetTitle>Select a device</SheetTitle>
            <SheetDescription>
              Choose a device to connect to and debug its services.
            </SheetDescription>
          </SheetHeader>
          <div className='pt-4'>
            <DeviceSelector setDeviceCandidate={(dev) => {
              setError(null);
              setDeviceCandidate(dev);
              setShowDeviceSelector(false);
            }} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

Page.config = buildPageConfig()

export default Page
