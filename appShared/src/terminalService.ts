import { Service, exposed } from './servicePrimatives';
import { TerminalSessionInfo } from './types';

export class TerminalService extends Service {
    public init() {
        this._init();
    }

    @exposed
    public async isAvailable(): Promise<boolean> {
        return false;
    }

    @exposed
    public async startTerminalSession(shell?: string): Promise<TerminalSessionInfo> {
        throw new Error('Not supported.');
    }

    @exposed
    public async writeTerminal(sessionId: string, data: string): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
        throw new Error('Not supported.');
    }

    @exposed
    public async stopTerminalSession(sessionId: string): Promise<void> {
        throw new Error('Not supported.');
    }
}
