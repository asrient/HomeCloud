import { ScreenService } from "shared/screenService";
import {
    RemoteAppInfo,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
} from "shared/types";
import { encodeMediaChunk } from "shared/mediaStream";
import { serviceStartMethod, serviceStopMethod } from "shared/servicePrimatives";
import { AppsDriver } from "./driver";
import { MacAppsDriver } from "./macDriver";
import { WinAppsDriver } from "./winDriver";
import { powerSaveBlocker } from "electron";

const SESSION_HEARTBEAT_TIMEOUT = 8_000; // 8s — close stream if no heartbeat from client

let _driver: AppsDriver | null = null;
function getDriver(): AppsDriver {
    if (_driver) return _driver;
    if (process.platform === "darwin") _driver = new MacAppsDriver();
    else if (process.platform === "win32") _driver = new WinAppsDriver();
    else throw new Error("Apps service is not supported on this platform");
    return _driver;
}

interface ScreenSession {
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    lastHeartbeat: number;
    lastWidth?: number;
    lastHeight?: number;
    lastDpi?: number;
}

export default class DesktopScreenService extends ScreenService {

    private installedAppsCache: RemoteAppInfo[] | null = null;

    private screenSession: ScreenSession | null = null;
    private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;

    private powerBlockerId: number | null = null;
    private lastCaptureTime = 0;
    private powerBlockerTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly POWER_BLOCKER_TIMEOUT = 10_000;

    protected override async _isAvailable(): Promise<boolean> {
        return true;
    }

    // ── App enumeration ──

    protected override async _getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> {
        if (!force && this.installedAppsCache) return this.installedAppsCache;
        this.installedAppsCache = getDriver().getInstalledApps();
        return this.installedAppsCache;
    }

    protected override async _getRunningApps(): Promise<RemoteAppInfo[]> {
        return getDriver().getRunningApps();
    }

    protected override async _launchApp(appId: string): Promise<void> {
        getDriver().launchApp(appId);
    }

    protected override async _quitApp(appId: string): Promise<void> {
        getDriver().quitApp(appId);
    }

    protected override async _getAppIcon(appId: string): Promise<string | null> {
        try {
            return getDriver().getAppIcon(appId);
        } catch {
            return null;
        }
    }

    // ── Full-screen H.264 Streaming ──

    protected override async _startStreamingSession(): Promise<StreamingSessionInfo> {
        const driver = getDriver();
        if (!driver.hasScreenRecordingPermission()) {
            throw new Error("Screen recording permission is required. Grant it in System Settings > Privacy & Security > Screen Recording.");
        }
        if (!driver.hasAccessibilityPermission()) {
            throw new Error("Accessibility permission is required for remote control. Grant it in System Settings > Privacy & Security > Accessibility.");
        }

        // Stop any existing session
        await this._stopStreamingSession();

        // Create a ReadableStream that will receive H.264 chunks
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                streamController = controller;
            },
            cancel: () => {
                this._stopStreamingSession().catch(() => {});
            },
        });

        // Start native H.264 screen stream
        let frameCount = 0;
        const result = driver.startH264ScreenStream((err, frame) => {
            if (err || !frame) {
                if (err) console.error(`[ScreenService] H264 screen stream callback error:`, err);
                return;
            }
            const session = this.screenSession;
            if (!session || !session.controller) {
                if (frameCount === 0) console.warn(`[ScreenService] Frame arrived but no screen session/controller`);
                return;
            }

            frameCount++;
            this.lastCaptureTime = Date.now();

            // Encode as HCMediaStream chunk
            const metadata: Record<string, string> = {
                type: frame.isKeyframe ? 'keyframe' : 'delta',
                ts: String(frame.timestamp),
            };
            // Send dimensions only when they change
            if (frame.width !== session.lastWidth || frame.height !== session.lastHeight || frame.dpi !== session.lastDpi) {
                metadata.width = String(frame.width);
                metadata.height = String(frame.height);
                metadata.dpi = String(frame.dpi);
                session.lastWidth = frame.width;
                session.lastHeight = frame.height;
                session.lastDpi = frame.dpi;
            }

            try {
                const chunk = encodeMediaChunk(metadata, frame.data);
                session.controller.enqueue(chunk);
                if (frameCount === 1 || frameCount % 100 === 0) {
                    // console.log(`[ScreenService] screen frame #${frameCount}: ${frame.isKeyframe ? 'keyframe' : 'delta'} ${frame.data.byteLength}B ${frame.width}x${frame.height}`);
                }
            } catch (e) {
                console.error(`[ScreenService] enqueue failed after ${frameCount} frames:`, e);
                this._stopStreamingSession().catch(() => {});
            }
        });

        console.log(`[ScreenService] startH264ScreenStream result:`, result ? { width: result.width, height: result.height, dpi: result.dpi } : 'null');

        if (!result) {
            throw new Error("Failed to start H.264 screen stream");
        }

        this.screenSession = {
            controller: streamController,
            lastHeartbeat: Date.now(),
        };

        this.startPowerBlocker();
        this.ensureSessionCleanup();

        return {
            stream,
            width: result.width,
            height: result.height,
            dpi: result.dpi,
        };
    }

    protected override async _stopStreamingSession(): Promise<void> {
        const session = this.screenSession;
        if (!session) return;
        console.log(`[ScreenService] stopStreamingSession (screen)`);
        this.screenSession = null;
        try { getDriver().stopH264ScreenStream(); } catch {}
        try { session.controller?.close(); } catch {}
    }

    protected override async _streamControl(fps?: number, quality?: number): Promise<void> {
        if (this.screenSession) this.screenSession.lastHeartbeat = Date.now();

        const driver = getDriver();

        if (fps != null && fps > 0) {
            driver.setScreenStreamFps(fps);
        }
        if (quality != null && quality >= 0 && quality <= 1) {
            const minBitrate = 2_000_000;   // 2 Mbps
            const maxBitrate = 30_000_000;  // 30 Mbps
            const bitrate = Math.round(minBitrate + quality * (maxBitrate - minBitrate));
            driver.setScreenStreamBitrate(bitrate);
        }
    }

    private ensureSessionCleanup(): void {
        if (this.sessionCleanupTimer) return;
        this.sessionCleanupTimer = setInterval(() => {
            const now = Date.now();
            if (this.screenSession && now - this.screenSession.lastHeartbeat > SESSION_HEARTBEAT_TIMEOUT) {
                console.log(`[ScreenService] No heartbeat for screen session, closing stream.`);
                this._stopStreamingSession();
            }
            if (!this.screenSession) {
                clearInterval(this.sessionCleanupTimer!);
                this.sessionCleanupTimer = null;
            }
        }, 4_000);
    }

    // ── Power management ──

    private startPowerBlocker() {
        if (this.powerBlockerId !== null && powerSaveBlocker.isStarted(this.powerBlockerId)) return;
        this.powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
        if (!this.powerBlockerTimer) {
            this.powerBlockerTimer = setInterval(() => {
                if (Date.now() - this.lastCaptureTime > DesktopScreenService.POWER_BLOCKER_TIMEOUT) {
                    this.stopPowerBlocker();
                }
            }, 10_000);
        }
    }

    private stopPowerBlocker() {
        if (this.powerBlockerTimer) {
            clearInterval(this.powerBlockerTimer);
            this.powerBlockerTimer = null;
        }
        if (this.powerBlockerId !== null && powerSaveBlocker.isStarted(this.powerBlockerId)) {
            powerSaveBlocker.stop(this.powerBlockerId);
        }
        this.powerBlockerId = null;
    }

    // ── Screen control ──

    protected override async _performAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        getDriver().performAction(payload);
    }

    // ── Screenshot ──

    protected override async _captureScreenshot(): Promise<string | null> {
        try {
            return getDriver().captureScreenshot();
        } catch {
            return null;
        }
    }

    // ── Permissions ──

    protected override async _hasScreenRecordingPermission(): Promise<boolean> {
        try { return getDriver().hasScreenRecordingPermission(); } catch { return false; }
    }

    protected override async _hasAccessibilityPermission(): Promise<boolean> {
        try { return getDriver().hasAccessibilityPermission(); } catch { return false; }
    }

    protected override async _requestScreenRecordingPermission(): Promise<void> {
        getDriver().requestScreenRecordingPermission();
    }

    protected override async _requestAccessibilityPermission(): Promise<void> {
        getDriver().requestAccessibilityPermission();
    }

    @serviceStartMethod
    public async start() {
        console.log("[ScreenService] Started.");
    }

    @serviceStopMethod
    public async stop() {
        this.stopPowerBlocker();
        this._stopStreamingSession();
        if (this.sessionCleanupTimer) {
            clearInterval(this.sessionCleanupTimer);
            this.sessionCleanupTimer = null;
        }
        console.log("[ScreenService] Stopped.");
    }
}
