/**
 * Lightweight MCP server implementing the Streamable HTTP transport.
 * Spec: https://modelcontextprotocol.io/specification/2025-11-25
 *
 * Handles JSON-RPC 2.0 over HTTP POST with JSON responses.
 * Supports: initialize, notifications/initialized, tools/list, tools/call, ping.
 * Tools: execute_script (run JS on device), get_api_doc (full API reference).
 *
 * Loosely coupled: consumers register tools via registerTool().
 */

import http from 'http';

const JSONRPC_VERSION = '2.0';
const MCP_PROTOCOL_VERSION = '2025-11-25';
const SERVER_NAME = 'HomeCloud';

// --- JSON-RPC types ---

type JsonRpcRequest = {
    jsonrpc: '2.0';
    id: string | number;
    method: string;
    params?: any;
};

type JsonRpcNotification = {
    jsonrpc: '2.0';
    method: string;
    params?: any;
};

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification;

function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
    return 'id' in msg;
}

function jsonRpcResult(id: string | number, result: any) {
    return { jsonrpc: JSONRPC_VERSION, id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string, data?: any) {
    return { jsonrpc: JSONRPC_VERSION, id, error: { code, message, ...(data !== undefined ? { data } : {}) } };
}

// --- Public tool registration type ---

export type McpToolDef = {
    name: string;
    description: string;
    inputSchema: any; // JSON Schema object
    callback: (args: Record<string, any>) => Promise<any>;
};

// --- MCP Server ---

export class McpHttpServer {
    private server: http.Server | null = null;
    private tools: McpToolDef[] = [];
    private initialized = false;
    private _port: number = 0;
    private _version: string = '0.0.0';

    get port(): number { return this._port; }
    get isRunning(): boolean { return this.server !== null && this.server.listening; }

    registerTool(tool: McpToolDef): void {
        this.tools.push(tool);
    }

    private findTool(name: string): McpToolDef | undefined {
        return this.tools.find(t => t.name === name);
    }

    private handleInitialize(id: string | number): any {
        this.initialized = true;
        return jsonRpcResult(id, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: {
                tools: { listChanged: false },
            },
            serverInfo: {
                name: SERVER_NAME,
                version: this._version,
            },
        });
    }

    private handleToolsList(id: string | number): any {
        const tools = this.tools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
        }));
        return jsonRpcResult(id, { tools });
    }

    private async handleToolsCall(id: string | number, params: any): Promise<any> {
        const { name, arguments: args } = params || {};
        if (!name || typeof name !== 'string') {
            return jsonRpcError(id, -32602, 'Missing tool name');
        }
        const tool = this.findTool(name);
        if (!tool) {
            return jsonRpcError(id, -32602, `Unknown tool: ${name}`);
        }
        try {
            const result = await tool.callback(args || {});
            const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return jsonRpcResult(id, {
                content: [{ type: 'text', text }],
            });
        } catch (err: any) {
            return jsonRpcResult(id, {
                content: [{ type: 'text', text: err.message || String(err) }],
                isError: true,
            });
        }
    }

    private async handleMessage(msg: JsonRpcMessage): Promise<any | null> {
        if (!isRequest(msg)) {
            return null;
        }
        switch (msg.method) {
            case 'initialize':
                return this.handleInitialize(msg.id);
            case 'ping':
                return jsonRpcResult(msg.id, {});
            case 'tools/list':
                return this.handleToolsList(msg.id);
            case 'tools/call':
                return this.handleToolsCall(msg.id, msg.params);
            default:
                return jsonRpcError(msg.id, -32601, `Method not found: ${msg.method}`);
        }
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id');
        res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'GET') {
            // SSE endpoint for server-initiated notifications
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
            req.on('close', () => res.end());
            return;
        }

        if (req.method === 'DELETE') {
            res.writeHead(200);
            res.end();
            return;
        }

        if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
            chunks.push(chunk as Buffer);
        }
        const bodyStr = Buffer.concat(chunks).toString('utf-8');

        let body: any;
        try {
            body = JSON.parse(bodyStr);
        } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')));
            return;
        }

        const isBatch = Array.isArray(body);
        const messages: JsonRpcMessage[] = isBatch ? body : [body];
        const responses: any[] = [];

        for (const msg of messages) {
            if (!msg.jsonrpc || msg.jsonrpc !== '2.0') {
                responses.push(jsonRpcError((msg as any)?.id ?? null, -32600, 'Invalid JSON-RPC version'));
                continue;
            }
            const result = await this.handleMessage(msg);
            if (result !== null) {
                responses.push(result);
            }
        }

        if (responses.length === 0) {
            res.writeHead(202);
            res.end();
            return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(isBatch ? responses : responses[0]));
    }

    async start(port: number = 0, version?: string): Promise<number> {
        if (this.isRunning) {
            throw new Error('MCP server is already running');
        }
        this._version = version || '0.0.0';
        console.log(`[MCP] Starting with ${this.tools.length} tools`);
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleHttpRequest(req, res).catch(err => {
                    console.error('[MCP] Request handler error:', err);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(jsonRpcError(null, -32603, 'Internal error')));
                    }
                });
            });
            this.server.listen(port, '127.0.0.1', () => {
                const addr = this.server!.address() as any;
                this._port = addr.port;
                console.log(`[MCP] Server listening on http://127.0.0.1:${this._port}`);
                resolve(this._port);
            });
            this.server.on('error', (err) => {
                console.error('[MCP] Server error:', err);
                reject(err);
            });
        });
    }

    async stop(): Promise<void> {
        if (!this.server) return;
        return new Promise((resolve) => {
            this.server!.close(() => {
                console.log('[MCP] Server stopped');
                this.server = null;
                this._port = 0;
                this.initialized = false;
                resolve();
            });
        });
    }
}
