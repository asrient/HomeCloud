import { TerminalService } from "shared/terminalService";
import { TerminalSessionInfo, TerminalSessionEntry, SignalEvent } from "shared/types";
import * as pty from "node-pty";
import { platform } from "os";
import { getDefaultShell } from "../utils";
import { RingBuffer } from "./ringBuffer";

interface ManagedTerminalSession {
    pty: pty.IPty;
    sessionId: string;
    shell: string;
    cols: number;
    rows: number;
    startedAt: number;
    persist: boolean;
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    attached: boolean;
    buffer: RingBuffer | null;
}

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_SESSIONS = 20;
const encoder = new TextEncoder();

export default class NodeTerminalService extends TerminalService {
    private sessions = new Map<string, ManagedTerminalSession>();
    private nextSessionId = 0;

    protected override async _isAvailable(): Promise<boolean> {
        return true;
    }

    private getProcessName(s: ManagedTerminalSession): string {
        // On Windows, pty.process returns the static terminal type name
        // rather than the actual foreground process. Fall back to shell name.
        if (platform() === 'win32') return s.shell;
        return s.pty.process || s.shell;
    }

    private toSessionEntry(s: ManagedTerminalSession): TerminalSessionEntry {
        return {
            sessionId: s.sessionId,
            shell: s.shell,
            pid: s.pty.pid,
            startedAt: s.startedAt,
            processName: this.getProcessName(s),
        };
    }

    private spawnSession(shell?: string, persist = false): ManagedTerminalSession {
        if (this.sessions.size >= MAX_SESSIONS) {
            throw new Error(`Maximum session limit (${MAX_SESSIONS}) reached.`);
        }

        const sessionId = `term-${++this.nextSessionId}`;
        const shellPath = shell || getDefaultShell();
        const args = platform() === 'win32' ? [] : ['-l'];

        const ptyProcess = pty.spawn(shellPath, args, {
            name: 'xterm-256color',
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            cwd: process.env.HOME || process.env.USERPROFILE || '/',
            env: process.env as Record<string, string>,
        });

        if (ptyProcess.pid === undefined) {
            try { ptyProcess.kill(); } catch {}
            throw new Error('Failed to spawn terminal process.');
        }

        const session: ManagedTerminalSession = {
            pty: ptyProcess,
            sessionId,
            shell: shellPath,
            cols: DEFAULT_COLS,
            rows: DEFAULT_ROWS,
            startedAt: Date.now(),
            persist,
            controller: null,
            attached: false,
            buffer: persist ? new RingBuffer() : null,
        };
        this.sessions.set(sessionId, session);

        // Pipe pty output to stream controller and ring buffer
        ptyProcess.onData((data: string) => {
            const s = this.sessions.get(sessionId);
            if (!s) return;
            const encoded = encoder.encode(data);
            // Always buffer for persistent sessions
            if (s.persist && s.buffer) {
                s.buffer.enqueue(encoded);
            }
            if (s.attached && s.controller) {
                try {
                    s.controller.enqueue(encoded);
                } catch {
                    // Stream closed — detach or kill depending on persist
                    if (s.persist) {
                        this.detachSession(s, true);
                    } else {
                        this._stopTerminalSession(sessionId).catch(() => {});
                    }
                }
            }
        });

        ptyProcess.onExit(() => {
            const s = this.sessions.get(sessionId);
            if (!s) return;
            try { s.controller?.close(); } catch {}
            this.sessions.delete(sessionId);
            if (s.persist) {
                this.terminalSessionSignal.dispatch(SignalEvent.REMOVE, this.toSessionEntry(s));
            }
        });

        return session;
    }

    private createAttachedStream(session: ManagedTerminalSession): ReadableStream<Uint8Array> {
        // Detach any existing client first
        if (session.attached) {
            this.detachSession(session);
        }

        const stream = new ReadableStream<Uint8Array>({
            start: (controller) => {
                session.controller = controller;
                session.attached = true;

                // Replay buffered output into the new stream
                if (session.buffer) {
                    const buffered = session.buffer.peek();
                    if (buffered.length > 0) {
                        try { controller.enqueue(buffered); } catch {}
                    }
                }
            },
            cancel: () => {
                if (session.persist) {
                    this.detachSession(session, true);
                } else {
                    this._stopTerminalSession(session.sessionId).catch(() => {});
                }
            },
        });

        return stream;
    }

    private detachSession(session: ManagedTerminalSession, emitSignal = false): void {
        try { session.controller?.close(); } catch {}
        session.controller = null;
        session.attached = false;
        if (emitSignal && session.persist) {
            this.terminalSessionSignal.dispatch(SignalEvent.UPDATE, this.toSessionEntry(session));
        }
    }

    // --- Legacy API (non-persistent by default) ---

    protected override async _startTerminalSession(shell?: string): Promise<TerminalSessionInfo> {
        const session = this.spawnSession(shell, false);
        const stream = this.createAttachedStream(session);
        return {
            stream,
            sessionId: session.sessionId,
            cols: session.cols,
            rows: session.rows,
        };
    }

    // --- V2 API ---

    protected override async _startTerminalSessionV2(shell?: string, persist?: boolean): Promise<TerminalSessionEntry> {
        const session = this.spawnSession(shell, persist ?? true);
        const entry = this.toSessionEntry(session);
        if (session.persist) {
            this.terminalSessionSignal.dispatch(SignalEvent.ADD, entry);
        }
        return entry;
    }

    protected override async _listTerminalSessions(): Promise<TerminalSessionEntry[]> {
        return Array.from(this.sessions.values())
            .filter(s => s.persist)
            .map(s => this.toSessionEntry(s));
    }

    protected override async _attachTerminalSession(sessionId: string): Promise<TerminalSessionInfo> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`No terminal session: ${sessionId}`);
        if (!session.persist) throw new Error(`Cannot attach to a non-persistent session: ${sessionId}`);
        const stream = this.createAttachedStream(session);
        this.terminalSessionSignal.dispatch(SignalEvent.UPDATE, this.toSessionEntry(session));
        return {
            stream,
            sessionId: session.sessionId,
            cols: session.cols,
            rows: session.rows,
        };
    }

    protected override async _detachTerminalSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        this.detachSession(session);
        if (session.persist) {
            this.terminalSessionSignal.dispatch(SignalEvent.UPDATE, this.toSessionEntry(session));
        }
    }

    // --- Shared across both session types ---

    protected override async _writeTerminal(sessionId: string, data: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`No terminal session: ${sessionId}`);
        session.pty.write(data);
    }

    protected override async _resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        cols = Math.max(1, Math.min(500, Math.floor(cols)));
        rows = Math.max(1, Math.min(200, Math.floor(rows)));
        session.pty.resize(cols, rows);
        session.cols = cols;
        session.rows = rows;
    }

    protected override async _stopTerminalSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        const wasPersist = session.persist;
        const entry = wasPersist ? this.toSessionEntry(session) : null;
        this.detachSession(session);
        this.sessions.delete(sessionId);
        try { session.pty.kill(); } catch {}
        if (wasPersist && entry) {
            this.terminalSessionSignal.dispatch(SignalEvent.REMOVE, entry);
        }
    }
}
