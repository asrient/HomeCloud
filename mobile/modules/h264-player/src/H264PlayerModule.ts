import { NativeModule, requireNativeModule } from 'expo';

declare class H264PlayerModule extends NativeModule {
  createSession(width: number, height: number): string;
  feedFrame(sessionId: string, data: Uint8Array, isKeyframe: boolean): Promise<void>;
  destroySession(sessionId: string): void;
}

export default requireNativeModule<H264PlayerModule>('H264Player');
