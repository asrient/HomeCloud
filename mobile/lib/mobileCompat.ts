import { HttpClientCompat, WsClientCompat } from "shared/compat";

export class HttpClient_ implements HttpClientCompat {
    private defaultHeaders: Record<string, string> = {};

    setDefaultHeader(name: string, value: string): void {
        this.defaultHeaders[name] = value;
    }

    async get(url: string | URL, headers?: Record<string, string>): Promise<Response> {
        const mergedHeaders = { ...this.defaultHeaders, ...headers };
        const response = await fetch(url, {
            method: 'GET',
            headers: mergedHeaders,
        });
        return response;
    }

    async post(url: string | URL, body: any, headers?: Record<string, string>): Promise<Response> {
        const mergedHeaders = { ...this.defaultHeaders, ...headers };
        const response = await fetch(url, {
            method: 'POST',
            headers: mergedHeaders,
            body: body,
        });
        return response;
    }
}

export class WebSocket_ extends WsClientCompat {
    private ws?: WebSocket;

    onopen?: (event: Event) => void;
    onmessage?: (event: MessageEvent) => void;
    onclose?: (event: CloseEvent) => void;
    onerror?: (event: Event) => void;

    isConnected(): boolean {
        return this.ws !== undefined && this.ws.readyState === WebSocket.OPEN;
    }

    connect(url: string, protocols?: string | string[]) {
        this.ws = new WebSocket(url, protocols);
        this.ws.onopen = (event: Event) => {
            if (this.onopen) {
                this.onopen(event);
            }
        };

        this.ws.onmessage = (event: MessageEvent) => {
            if (this.onmessage) {
                this.onmessage(event);
            }
        };

        this.ws.onclose = (event: CloseEvent) => {
            if (this.onclose) {
                this.onclose(event);
            }
        };

        this.ws.onerror = (event: Event) => {
            if (this.onerror) {
                this.onerror(event);
            }
        };
    }

    send(data: string | ArrayBuffer | Blob | ArrayBufferView): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
        }
    }

    close(code?: number, reason?: string): void {
        if (this.ws) {
            this.ws.close(code, reason);
        }
    }
}
