import { AppsService } from "shared/appsService";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
} from "shared/types";
import { encodeMediaChunk } from "shared/mediaStream";
import { serviceStartMethod, serviceStopMethod, exposed } from "shared/servicePrimatives";
import { AppsDriver } from "./driver";
import { MacAppsDriver } from "./macDriver";
import { WinAppsDriver } from "./winDriver";
import { powerSaveBlocker } from "electron";

const SESSION_HEARTBEAT_TIMEOUT = 8_000; // 8s — close stream if no heartbeat from client
const WINDOW_WATCH_IDLE_TIMEOUT = 3 * 60_000; // 3 min — stop watching if no heartbeat

let _driver: AppsDriver | null = null;
function getDriver(): AppsDriver {
    if (_driver) return _driver;
    if (process.platform === "darwin") _driver = new MacAppsDriver();
    else if (process.platform === "win32") _driver = new WinAppsDriver();
    else throw new Error("Apps service is not supported on this platform");
    return _driver;
}

interface StreamSession {
    windowId: string;
    controller: ReadableStreamDefaultController<Uint8Array> | null;
    lastHeartbeat: number;
    lastWidth?: number;
    lastHeight?: number;
    lastDpi?: number;
}

export default class DesktopAppsService extends AppsService {

    private installedAppsCache: RemoteAppInfo[] | null = null;
    private runningAppsCache: RemoteAppInfo[] | null = null;

    private windowSessions = new Map<string, StreamSession>();
    private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;

    private powerBlockerId: number | null = null;
    private lastCaptureTime = 0;
    private powerBlockerTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly POWER_BLOCKER_TIMEOUT = 10_000;

    private windowWatchingActive = false;
    private windowWatchTimer: ReturnType<typeof setTimeout> | null = null;

    @exposed
    public override async isAvailable(): Promise<boolean> {
        return true;
    }

    // ── App enumeration ──

    @exposed
    public async getInstalledApps(force?: boolean): Promise<RemoteAppInfo[]> {
        if (!force && this.installedAppsCache) return this.installedAppsCache;
        this.installedAppsCache = getDriver().getInstalledApps();
        return this.installedAppsCache;
    }

    @exposed
    public async getRunningApps(): Promise<RemoteAppInfo[]> {
        if (!this.runningAppsCache) {
            this.runningAppsCache = getDriver().getRunningApps();
        }
        return this.runningAppsCache;
    }

    @exposed
    public async launchApp(appId: string): Promise<void> {
        getDriver().launchApp(appId);
    }

    @exposed
    public async quitApp(appId: string): Promise<void> {
        getDriver().quitApp(appId);
    }

    @exposed
    public async getAppIcon(appId: string): Promise<string | null> {
        try {
            return getDriver().getAppIcon(appId);
        } catch {
            return null;
        }
    }

    @exposed
    public async getWindows(appId?: string): Promise<RemoteAppWindow[]> {
        return getDriver().getWindows(appId);
    }

    @exposed
    public async watchWindowsHeartbeat(): Promise<void> {
        if (!this.windowWatchingActive) {
            this.windowWatchingActive = true;
            const driver = getDriver();
            driver.startWindowWatching(
                (app, win) => this.windowCreated.dispatch({ app, window: win }),
                (app, win) => this.windowDestroyed.dispatch({ app, window: win }),
            );
            console.log("[AppsService] Window watching started (heartbeat).");
        }
        this.rescheduleWindowWatchTimeout();
    }

    private rescheduleWindowWatchTimeout(): void {
        if (this.windowWatchTimer) clearTimeout(this.windowWatchTimer);
        this.windowWatchTimer = setTimeout(() => {
            this.windowWatchTimer = null;
            this.stopWindowWatching();
        }, WINDOW_WATCH_IDLE_TIMEOUT);
    }

    // ── H.264 Window Streaming ──

    @exposed
    public async startStreamingSession(windowId: string): Promise<StreamingSessionInfo> {
        const driver = getDriver();
        if (!driver.hasScreenRecordingPermission()) {
            throw new Error("Screen recording permission is required. Grant it in System Settings > Privacy & Security > Screen Recording.");
        }
        if (!driver.hasAccessibilityPermission()) {
            throw new Error("Accessibility permission is required for remote control. Grant it in System Settings > Privacy & Security > Accessibility.");
        }

        const numId = Number(windowId);

        // Stop any existing session for this window
        await this.stopStreamingSession(windowId);

        // Create a ReadableStream that will receive H.264 chunks
        let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                streamController = controller;
            },
            cancel: () => {
                this.stopStreamingSession(windowId).catch(() => {});
            },
        });

        // Start native H.264 stream
        let frameCount = 0;
        const result = driver.startH264Stream(numId, (err, frame) => {
            if (err || !frame) {
                if (err) console.error(`[AppsService] H264 stream callback error:`, err);
                return;
            }
            const session = this.windowSessions.get(windowId);
            if (!session || !session.controller) {
                if (frameCount === 0) console.warn(`[AppsService] Frame arrived but no session/controller for ${windowId}`);
                return;
            }

            frameCount++;
            this.lastCaptureTime = Date.now();

            // Encode as HCMediaStream chunk
            const metadata: Record<string, string> = {
                type: frame.isKeyframe ? 'keyframe' : 'delta',
                ts: String(frame.timestamp),
            };
            // Send dimensions only when they change (first frame always has them since last* starts undefined)
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
                if (frameCount <= 3 || frameCount % 100 === 0) {
                    console.log(`[AppsService] frame #${frameCount}: ${frame.isKeyframe ? 'keyframe' : 'delta'} ${frame.data.byteLength}B ${frame.width}x${frame.height}`);
                }
            } catch (e) {
                console.error(`[AppsService] enqueue failed after ${frameCount} frames:`, e);
                // Stream closed (client disconnected / cancelled) — stop the native encoder
                this.stopStreamingSession(windowId).catch(() => {});
            }
        });

        console.log(`[AppsService] startH264Stream result:`, result ? { width: result.width, height: result.height, dpi: result.dpi } : 'null');

        if (!result) {
            throw new Error("Failed to start H.264 stream");
        }

        const session: StreamSession = {
            windowId,
            controller: streamController,
            lastHeartbeat: Date.now(),
        };
        this.windowSessions.set(windowId, session);

        this.startPowerBlocker();
        this.ensureSessionCleanup();

        return {
            stream,
            width: result.width,
            height: result.height,
            dpi: result.dpi,
        };
    }

    @exposed
    public async stopStreamingSession(windowId: string): Promise<void> {
        const session = this.windowSessions.get(windowId);
        if (!session) return;
        console.log(`[AppsService] stopStreamingSession: ${windowId}`);
        this.windowSessions.delete(windowId);
        const numId = Number(windowId);
        try { getDriver().stopH264Stream(numId); } catch {}
        try { session.controller?.close(); } catch {}
    }

    @exposed
    public async streamControl(windowId: string, fps?: number, quality?: number): Promise<void> {
        const session = this.windowSessions.get(windowId);
        if (session) session.lastHeartbeat = Date.now();

        const numId = Number(windowId);
        const driver = getDriver();

        if (fps != null && fps > 0) {
            driver.setStreamFps(numId, fps);
        }
        if (quality != null && quality >= 0 && quality <= 1) {
            const minBitrate = 2_000_000;   // 2 Mbps
            const maxBitrate = 30_000_000;  // 30 Mbps
            const bitrate = Math.round(minBitrate + quality * (maxBitrate - minBitrate));
            driver.setStreamBitrate(numId, bitrate);
        }
    }

    private ensureSessionCleanup(): void {
        if (this.sessionCleanupTimer) return;
        this.sessionCleanupTimer = setInterval(() => {
            const now = Date.now();
            for (const [windowId, session] of this.windowSessions) {
                if (now - session.lastHeartbeat > SESSION_HEARTBEAT_TIMEOUT) {
                    console.log(`No heartbeat for window ${windowId}, closing stream.`);
                    this.stopStreamingSession(windowId);
                }
            }
            if (this.windowSessions.size === 0) {
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
                if (Date.now() - this.lastCaptureTime > DesktopAppsService.POWER_BLOCKER_TIMEOUT) {
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

    // ── Window control ──

    private stopWindowWatching(): void {
        if (!this.windowWatchingActive) return;
        this.windowWatchingActive = false;
        getDriver().stopWindowWatching();
        if (this.windowWatchTimer) {
            clearTimeout(this.windowWatchTimer);
            this.windowWatchTimer = null;
        }
        console.log("[AppsService] Window watching stopped (idle).");
    }

    @exposed
    public async performWindowAction(payload: RemoteAppWindowActionPayload): Promise<void> {
        getDriver().performAction(payload);
    }

    // ── Permissions ──

    @exposed
    public async hasScreenRecordingPermission(): Promise<boolean> {
        try { return getDriver().hasScreenRecordingPermission(); } catch { return false; }
    }

    @exposed
    public async hasAccessibilityPermission(): Promise<boolean> {
        try { return getDriver().hasAccessibilityPermission(); } catch { return false; }
    }

    @exposed
    public async requestScreenRecordingPermission(): Promise<void> {
        getDriver().requestScreenRecordingPermission();
    }

    @exposed
    public async requestAccessibilityPermission(): Promise<void> {
        getDriver().requestAccessibilityPermission();
    }

    @serviceStartMethod
    public async start() {
        const driver = getDriver();
        driver.watchRunningApps(
            (app) => {
                if (this.runningAppsCache) {
                    this.runningAppsCache = [...this.runningAppsCache, app];
                }
                this.appLaunched.dispatch(app);
            },
            (app) => {
                if (this.runningAppsCache) {
                    this.runningAppsCache = this.runningAppsCache.filter(a => a.id !== app.id);
                }
                this.appQuit.dispatch(app);
            },
        );
        // Window watching is started on-demand via watchWindowsHeartbeat()
        console.log("AppsService started.");
    }

    @serviceStopMethod
    public async stop() {
        const driver = getDriver();
        this.stopWindowWatching();
        driver.unwatchRunningApps();
        this.stopPowerBlocker();
        for (const windowId of [...this.windowSessions.keys()]) {
            this.stopStreamingSession(windowId);
        }
        if (this.sessionCleanupTimer) {
            clearInterval(this.sessionCleanupTimer);
            this.sessionCleanupTimer = null;
        }
        console.log("AppsService stopped.");
    }
}
