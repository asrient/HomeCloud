import { io, Socket } from "socket.io-client";
import { isDesktop, staticConfig } from "../staticConfig";

let socket: Socket | null = null;

function setup() {
    if (isDesktop()) return;
    let url = staticConfig.apiBaseUrl;
    if (url.endsWith('/api')) {
        url = url.slice(0, -4);
    }
    console.log('setup socket', url);
    socket = io(url, {
        transports: ['websocket'],
    });
}

function connect() {
    if (isDesktop()) return;
    if (!socket) {
        throw new Error('Socket not setup');
    }
    console.log('connect socket');
    socket.connect();
}

export function onEvent(eventName: string, callback: (data: any) => void): () => void {
    if (isDesktop()) {
        if (!window.appEvent) {
            throw new Error('appEvent not setup');
        }
        return window.appEvent.listen(eventName, callback);
    }
    if (!socket) {
        setup();
    }
    if (!socket) {
        throw new Error('Could not setup socket');
    }
    if (!socket.connected) {
        connect();
    }
    socket.on(eventName, callback);
    return () => {
        socket?.off(eventName, callback);
    }
}
