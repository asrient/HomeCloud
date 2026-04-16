import { TerminalService } from "shared/terminalService";
import { TerminalSessionInfo } from "shared/types";
import * as pty from "node-pty";
import { platform } from "os";
import { getDefaultShell } from "../utils";

interface TerminalSession {
    pty: pty.IPty;
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    sessionId: string;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;

export default class NodeTerminalService extends TerminalService {
    private sessions = new Map<string, TerminalSession>();
    private nextSessionId = 0;

    protected override async _isAvailable(): Promise<boolean> {
        return true;
    }

    protected override async _startTerminalSession(shell?: string): Promise<TerminalSessionInfo> {
        const sessionId = `term-${++this.nextSessionId}`;

        const shellPath = shell || getDefaultShell();

        // Create ReadableStream for output
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                streamController = controller;
            },
            cancel: () => {
                this._stopTerminalSession(sessionId).catch(() => {});
            },
        });

        // Spawn pty — use login shell flag so user's PATH is loaded in packaged apps
        const args = platform() === 'win32' ? [] : ['-l'];
        const ptyProcess = pty.spawn(shellPath, args, {
            name: 'xterm-256color',
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            cwd: process.env.HOME || process.env.USERPROFILE || '/',
            env: process.env as Record<string, string>,
        });

        const session: TerminalSession = {
            pty: ptyProcess,
            controller: streamController,
            sessionId,
        };
        this.sessions.set(sessionId, session);

        // Pipe pty output to ReadableStream
        ptyProcess.onData((data: string) => {
            const s = this.sessions.get(sessionId);
            if (!s || !s.controller) return;
            try {
                s.controller.enqueue(new TextEncoder().encode(data));
            } catch {
                // Stream closed
                this._stopTerminalSession(sessionId).catch(() => {});
            }
        });

        ptyProcess.onExit(() => {
            const s = this.sessions.get(sessionId);
            if (!s) return;
            try { s.controller?.close(); } catch {}
            this.sessions.delete(sessionId);
        });

        return {
            stream,
            sessionId,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
        };
    }

    protected override async _writeTerminal(sessionId: string, data: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`No terminal session: ${sessionId}`);
        session.pty.write(data);
    }

    protected override async _resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        session.pty.resize(cols, rows);
    }

    protected override async _stopTerminalSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        this.sessions.delete(sessionId);
        try { session.pty.kill(); } catch {}
        try { session.controller?.close(); } catch {}
    }
}
