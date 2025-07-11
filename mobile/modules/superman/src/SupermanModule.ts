import { NativeModule, requireNativeModule } from 'expo';

import { SupermanModuleEvents } from './Superman.types';

declare class SupermanModule extends NativeModule<SupermanModuleEvents> {
  hello(): string;
  generateThumbnailJpeg(fileUri: string): Promise<Uint8Array>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SupermanModule>('Superman');
