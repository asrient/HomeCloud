import { NativeModule, requireNativeModule } from 'expo';

import { SupermanModuleEvents, StandardDirectoryType, DiskInfo } from './Superman.types';

declare class SupermanModule extends NativeModule<SupermanModuleEvents> {
  hello(): string;
  generateThumbnailJpeg(fileUri: string): Promise<Uint8Array>;
  getStandardDirectoryUri(standardDirectory: StandardDirectoryType): string | null;
  tcpConnect(host: string, port: number): Promise<string>;
  tcpSend(connectionId: string, data: Uint8Array): Promise<boolean>;
  tcpClose(connectionId: string): Promise<boolean>;
  tcpStartServer(port: number): Promise<{ port: number }>;
  tcpStopServer(): Promise<boolean>;
  udpCreateSocket(): Promise<string>;
  udpBind(socketId: string, port?: number, address?: string): Promise<{ address: string; port: number }>;
  udpSend(socketId: string, data: Uint8Array, port: number, address: string): Promise<boolean>;
  udpClose(socketId: string): Promise<boolean>;
  getDisks(): Promise<DiskInfo[]>;
  hasAllFilesAccess(): boolean;
  requestAllFilesAccess(): boolean;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SupermanModule>('Superman');
