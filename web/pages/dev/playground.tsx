import { SettingsSidebar } from '@/components/shell/settingsSidebar'
import Head from 'next/head'
import Image from 'next/image'
import { SidebarType } from '@/lib/types'
import { buildPageConfig } from '@/lib/utils'
import PageBar from '@/components/pageBar'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'

export type MethodInfo = {
    isExposed: boolean;
    isAllowAll: boolean;
    passContext: boolean;
}

export type ServiceDoc = {
    __doctype__: 'function' | 'error';
    description?: string;
    methodInfo?: MethodInfo;
    fqn?: string;
}

export type ServiceDocTree = {
    [key: string]: ServiceDoc | ServiceDocTree;
}

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
      const paramsArray = JSON.parse(params);
      // iterate through the serviceController to find the function by FQN
      const parts = fqn.split('.');
      // remove the last part if it is a function name
      const funcName = parts.pop();
      if (!funcName) {
        throw new Error('Function name is required in FQN');
      }
      let obj = serviceController;
      for (const part of parts) {
        if(typeof obj !== 'object') {
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
      >
        Execute
      </Button>
      {result && (
        <div className='mt-4 p-2 bg-green-100 text-green-800 rounded-md'>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      {error && (
        <div className='mt-4 p-2 bg-red-100 text-red-800 rounded-md overflow-y-auto'>
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
  serviceController: any;
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
  serviceController: any;
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
          return(
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
        )})
      }
    </Accordion>
  )
}

function Page() {

  const servicesDoc = useMemo(() => {
    const sc = (window as any).modules.getLocalServiceController()
    return sc.getDoc();
  }, []);

  const sc = useMemo(() => (window as any).modules.getLocalServiceController(), []);

  return (
    <>
      <Head>
        <title>Playground</title>
      </Head>
      <PageBar icon='/icons/program.png' title='Debug Services'>
      </PageBar>
      <main className='p-6'>
        <ServiceFragment docTree={servicesDoc} serviceController={sc} name='Local Service Controller' />
      </main>
    </>
  )
}

Page.config = buildPageConfig(SidebarType.Dev)

export default Page
