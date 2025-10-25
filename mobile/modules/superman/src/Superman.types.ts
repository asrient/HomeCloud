export type SupermanModuleEvents = {
  tcpData: (params: { connectionId: string; data: Uint8Array }) => void;
  tcpError: (params: { connectionId: string; error: string }) => void;
  tcpClose: (params: { connectionId: string }) => void;
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
