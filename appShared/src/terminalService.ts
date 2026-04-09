import { Service, exposed, info, input, output } from './servicePrimatives';
import { Sch, TerminalSessionInfo, TerminalSessionInfoSchema } from './types';

export class TerminalService extends Service {
    public init() {
        this._init();
    }

    @exposed @info("Check if terminal access is available")
    @output(Sch.Boolean)
    public async isAvailable(): Promise<boolean> { return this._isAvailable(); }
    
    @exposed @info("Start a new terminal session with optional shell")
    @input(Sch.Name('shell', Sch.Optional(Sch.String)))
    @output(TerminalSessionInfoSchema)
    public async startTerminalSession(shell?: string): Promise<TerminalSessionInfo> { return this._startTerminalSession(shell); }
    
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
    protected async _writeTerminal(sessionId: string, data: string): Promise<void> { throw new Error('Not supported.'); }
    protected async _resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> { throw new Error('Not supported.'); }
    protected async _stopTerminalSession(sessionId: string): Promise<void> { throw new Error('Not supported.'); }
}
