import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { getServiceController, buildPageConfig, getLocalServiceController } from '@/lib/utils';
import { NextPageWithConfig } from '@/pages/_app';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import LoadingIcon from '@/components/ui/loadingIcon';

const TerminalPage: NextPageWithConfig = () => {
  const router = useRouter();
  const { fingerprint: fingerprintStr } = router.query as { fingerprint?: string };
  const fingerprint = useMemo(() => fingerprintStr || null, [fingerprintStr]);

  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const fingerprintRef = useRef<string | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageTitle = useMemo(() => {
    try {
      if (fingerprint) {
        const peer = getLocalServiceController().app.getPeer(fingerprint);
        return `Terminal - ${peer?.deviceName || 'Remote'}`;
      }
      return `Terminal - Local`;
    } catch {
      return 'Terminal';
    }
  }, [fingerprint]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Initialize terminal and connect
  useEffect(() => {
    if (!termContainerRef.current) return;
    setIsConnecting(true);
    setError(null);
    const currentFingerprint = fingerprint;
    fingerprintRef.current = currentFingerprint;

    // Create xterm instance
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#ffffff',
        selectionBackground: '#264f78',
      },
      allowProposedApi: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Enable copy/paste keyboard shortcuts (Cmd/Ctrl+C copies when selection exists,
    // Cmd/Ctrl+V pastes). Returning false tells xterm not to forward the key to the pty.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return true;
      const key = e.key.toLowerCase();
      if (key === 'c' && term.hasSelection()) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
          return false;
        }
      }
      if (key === 'v') {
        navigator.clipboard.readText().then((text) => {
          if (!text || !sessionIdRef.current) return;
          getServiceController(fingerprintRef.current)
            .then((sc) => sc.terminal.writeTerminal(sessionIdRef.current!, text))
            .catch(() => {});
        }).catch(() => {});
        return false;
      }
      return true;
    });

    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let sessionId: string | null = null;

    const connect = async () => {
      try {
        const sc = await getServiceController(fingerprintRef.current);
        if (cancelled) return;

        const session = await sc.terminal.startTerminalSession();
        if (cancelled) return;

        sessionId = session.sessionId;
        sessionIdRef.current = sessionId;

        // Resize pty to match terminal
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          term.resize(dims.cols, dims.rows);
          sc.terminal.resizeTerminal(sessionId, dims.cols, dims.rows).catch(() => {});
        }

        setIsConnecting(false);

        // Handle input: keystrokes → writeTerminal
        const inputDisposable = term.onData((data: string) => {
          if (!sessionIdRef.current) return;
          getServiceController(fingerprintRef.current)
            .then(sc => sc.terminal.writeTerminal(sessionIdRef.current!, data))
            .catch(() => {});
        });

        // Handle resize
        const resizeDisposable = term.onResize(({ cols, rows }) => {
          if (!sessionIdRef.current) return;
          getServiceController(fingerprintRef.current)
            .then(sc => sc.terminal.resizeTerminal(sessionIdRef.current!, cols, rows))
            .catch(() => {});
        });

        // Window resize → fit terminal
        const onWindowResize = () => {
          fitAddon.fit();
        };
        window.addEventListener('resize', onWindowResize);

        // Read output stream
        reader = session.stream.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled || !isMountedRef.current) break;
          term.write(decoder.decode(value));
        }

        if (!cancelled && isMountedRef.current) {
          setError('Terminal session ended.');
        }

        inputDisposable.dispose();
        resizeDisposable.dispose();
        window.removeEventListener('resize', onWindowResize);
      } catch (e: any) {
        if (cancelled || !isMountedRef.current) return;
        console.error('Terminal error:', e);
        setError(e?.message || 'Failed to connect to terminal.');
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (reader) reader.cancel().catch(() => {});
      readerRef.current = null;
      if (sessionId) {
        getServiceController(currentFingerprint)
          .then(sc => sc.terminal.stopTerminalSession(sessionId!))
          .catch(() => {});
      }
      sessionIdRef.current = null;
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [fingerprint]);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <div className='flex flex-col w-screen h-screen bg-[#1e1e1e] overflow-hidden'>
        {isConnecting && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/70 z-10'>
            <div className='flex flex-col items-center gap-2 text-white/80 text-sm'>
              <LoadingIcon />
              Connecting...
            </div>
          </div>
        )}
        {error && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/70 z-10'>
            <div className='text-white/80 text-sm'>{error}</div>
          </div>
        )}
        <div ref={termContainerRef} className='flex-1 min-h-0' />
      </div>
    </>
  );
};

TerminalPage.config = buildPageConfig(true);
export default TerminalPage;
