import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import net from 'net';

// Calculate hash depending on version, runtime, user... So we won't
// accidentally prevent launch when there are multiple users running program.
let _socketPath = null;

export function setupSocketPath(appName: string) {
    const hash = crypto
        .createHash('sha1')
        .update(process.execPath)
        .update(process.arch)
        .update(os.userInfo().username)
        .update(appName)
        .digest('base64')
        .substring(0, 10)
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    const socketName = `${appName}-${hash}.sock`;
    _socketPath = process.platform == 'win32'
        ? `\\\\.\\pipe\\${socketName}`
        : `${os.tmpdir()}/${socketName}`;
}

function getSocketPath() {
    if (!_socketPath)
        throw new Error('Socket path is not set up');
    return _socketPath;
}

// Return true if there is already an assistant running
export async function check(intent = 'activate') {
    const client = net.connect({ path: getSocketPath() });
    const connected = await connectionPromise(client);
    if (!connected)
        return false;
    client.end(intent);
    return true;
}

// Waiting for net.connect is slow, do a quick check first.
export function quickCheckSync() {
    return fs.existsSync(getSocketPath());
}

// Listen for new instances.
let server: net.Server = null;
export function listen(callback: (action: string) => void) {
    if (server)
        throw new Error('Can not listen for twice');
    deleteSocketFile();
    server = net.createServer((connection) => {
        console.log('New instance connected');
        connection.setTimeout(1000);
        let startTime = Date.now();
        let data = '';
        connection.on('data', (chunk: Buffer) => {
            data += chunk.toString();
            if (Date.now() - startTime > 4000) {
                connection.destroy(new Error('Homecloud IPC Timeout'));
            }
        });
        connection.on('end', () => {
            data.length && callback(data);
            connection.end();
        });
    });
    server.listen(getSocketPath());
    server.on('error', (error: any) => {
        console.error('Failed to listen for new instances', error);
    });
    process.once('exit', deleteSocketFile);
}

export function clear() {
    server.close();
    deleteSocketFile();
}

// Turn connection into Promise.
function connectionPromise(connection: net.Socket) {
    return new Promise((resolve) => {
        connection.on('connect', () => {
            resolve(true);
        });
        connection.on('error', () => {
            resolve(false);
        });
    });
}

// Clear the socket file.
function deleteSocketFile() {
    try {
        fs.unlinkSync(getSocketPath());
    } catch (e) {
        // Ignore error.
    }
}
