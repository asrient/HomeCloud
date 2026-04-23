import { Service, exposed, info, input, output } from './servicePrimatives';
import { Sch, SignalEvent, TerminalSessionInfo, TerminalSessionInfoSchema, TerminalSessionEntry, TerminalSessionEntrySchema } from './types';
import Signal from './signals';

export class TerminalService extends Service {
    static serviceDescription = 'Remote terminal sessions.';

    public terminalSessionSignal = new Signal<[SignalEvent, TerminalSessionEntry]>({ isExposed: true, isAllowAll: false });

    public init() {
        this._init();
    }

    @exposed @info("Check if terminal access is available")
    @output(Sch.Boolean)
    public async isAvailable(): Promise<boolean> { return this._isAvailable(); }

    @exposed @info("Start a new terminal session with optional shell (non-persistent, stream cancel kills session)")
    @input(Sch.Name('shell', Sch.Optional(Sch.String)))
    @output(TerminalSessionInfoSchema)
    public async startTerminalSession(shell?: string): Promise<TerminalSessionInfo> { return this._startTerminalSession(shell); }

    @exposed @info("Start a new terminal session (V2) with optional persistence")
    @input(Sch.Name('shell', Sch.Optional(Sch.String)), Sch.Name('persist', Sch.Optional(Sch.Boolean)))
    @output(TerminalSessionEntrySchema)
    public async startTerminalSessionV2(shell?: string, persist?: boolean): Promise<TerminalSessionEntry> { return this._startTerminalSessionV2(shell, persist); }

    @exposed @info("List active persistent terminal sessions")
    @output(Sch.Array(TerminalSessionEntrySchema))
    public async listTerminalSessions(): Promise<TerminalSessionEntry[]> { return this._listTerminalSessions(); }

    @exposed @info("Attach to an existing terminal session, returns output stream")
    @input(Sch.Name('sessionId', Sch.String))
    @output(TerminalSessionInfoSchema)
    public async attachTerminalSession(sessionId: string): Promise<TerminalSessionInfo> { return this._attachTerminalSession(sessionId); }

    @exposed @info("Detach from a terminal session without killing it")
    @input(Sch.Name('sessionId', Sch.String))
    public async detachTerminalSession(sessionId: string): Promise<void> { return this._detachTerminalSession(sessionId); }

    @exposed @info("Write input data to a terminal session")
    @input(Sch.Name('sessionId', Sch.String), Sch.Name('data', Sch.String))
    public async writeTerminal(sessionId: string, data: string): Promise<void> { return this._writeTerminal(sessionId, data); }

    @exposed @info("Resize a terminal session's dimensions")
    @input(Sch.Name('sessionId', Sch.String), Sch.Name('cols', Sch.Integer), Sch.Name('rows', Sch.Integer))
    public async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> { return this._resizeTerminal(sessionId, cols, rows); }

    @exposed @info("Stop and close a terminal session")
    @input(Sch.Name('sessionId', Sch.String))
    public async stopTerminalSession(sessionId: string): Promise<void> { return this._stopTerminalSession(sessionId); }

    protected async _isAvailable(): Promise<boolean> { return false; }
    protected async _startTerminalSession(shell?: string): Promise<TerminalSessionInfo> { throw new Error('Not supported.'); }
    protected async _startTerminalSessionV2(shell?: string, persist?: boolean): Promise<TerminalSessionEntry> { throw new Error('Not supported.'); }
    protected async _listTerminalSessions(): Promise<TerminalSessionEntry[]> { throw new Error('Not supported.'); }
    protected async _attachTerminalSession(sessionId: string): Promise<TerminalSessionInfo> { throw new Error('Not supported.'); }
    protected async _detachTerminalSession(sessionId: string): Promise<void> { throw new Error('Not supported.'); }
    protected async _writeTerminal(sessionId: string, data: string): Promise<void> { throw new Error('Not supported.'); }
    protected async _resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> { throw new Error('Not supported.'); }
    protected async _stopTerminalSession(sessionId: string): Promise<void> { throw new Error('Not supported.'); }
}
