export type SupermanModuleEvents = {
  tcpData: (params: { connectionId: string; data: Uint8Array }) => void;
  tcpError: (params: { connectionId: string; error: string }) => void;
  tcpClose: (params: { connectionId: string }) => void;
  tcpIncomingConnection: (params: { connectionId: string }) => void;
  udpMessageBatch: (params: { socketId: string; address: string; port: number; data: Uint8Array; lengths: number[] }) => void;
  udpError: (params: { socketId: string; error: string }) => void;
  udpListening: (params: { socketId: string; address: string; port: number }) => void;
  udpClose: (params: { socketId: string }) => void;
};

export type StandardDirectoryType =
    'Documents'
    | 'Downloads'
    | 'Pictures'
    | 'Videos'
    | 'Music'
    | 'Movies'
    | 'Phone Storage'
    | 'SD Card';

export type DiskInfo = {
    type: 'internal' | 'external';
    name: string;
    path: string;
    size: number;
    free: number;
};
