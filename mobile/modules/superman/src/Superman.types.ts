export type SupermanModuleEvents = {
  tcpData: (params: { connectionId: string; data: Uint8Array }) => void;
  tcpError: (params: { connectionId: string; error: string }) => void;
  tcpClose: (params: { connectionId: string }) => void;
  udpMessage: (params: { socketId: string; data: Uint8Array; address: string; port: number }) => void;
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
