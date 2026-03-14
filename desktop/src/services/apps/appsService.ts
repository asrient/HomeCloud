import { AppsService } from "shared/appsService";
import {
    RemoteAppInfo,
    RemoteAppWindow,
    RemoteAppWindowActionPayload,
    StreamingSessionInfo,
} from "shared/types";
import { encodeMediaChunk } from "shared/mediaStream";
import { serviceStartMethod, serviceStopMethod, exposed } from "shared/servicePrimatives";
import * as macDriver from "./macDriver";
import * as winDriver from "./winDriver";
import { powerSaveBlocker } from "electron";

const POLL_INTERVAL = 5_000;
const POLL_IDLE_TIMEOUT = 180_000;
const WINDOW_POLL_INTERVAL = 3_000;
const WINDOW_POLL_IDLE_TIMEOUT = 180_000;
const SESSION_HEARTBEAT_TIMEOUT = 8_000; // 8s — close stream if no heartbeat from client
const DEFAULT_BITRATE = 15_000_000; // 15 Mbps — good for 2x Retina screen content

const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

function getDriver() {
    if (isMac) return macDriver;
    if (isWin) return winDriver;
    throw new Error("Apps service is not supported on this platform");
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
    private runningAppsIds: Set<string> | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private lastRunningAppsCall = 0;

    private windowWatchers = new Map<string, {
        timer: ReturnType<typeof setInterval>;
        windowIds: Set<string>;
        lastAccess: number;
    }>();

    private windowSessions = new Map<string, StreamSession>();
    private sessionCleanupTimer: ReturnType<typeof setInterval> | null = null;

    private powerBlockerId: number | null = null;
    private lastCaptureTime = 0;
    private powerBlockerTimer: ReturnType<typeof setInterval> | null = null;
    private static readonly POWER_BLOCKER_TIMEOUT = 10_000;

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
        return getDriver().getRunningApps();
    }

    @exposed
    public async watchRunningApps(): Promise<void> {
        this.lastRunningAppsCall = Date.now();
        if (this.pollTimer) return;
        this.runningAppsIds = new Set(getDriver().getRunningApps().map(a => a.id));
        this.pollTimer = setInterval(() => this.pollRunningApps(), POLL_INTERVAL);
    }

    @exposed
    public async unwatchRunningApps(): Promise<void> {
        this.stopPolling();
    }

    private stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.runningAppsIds = null;
    }

    private pollRunningApps() {
        if (Date.now() - this.lastRunningAppsCall > POLL_IDLE_TIMEOUT) {
            this.stopPolling();
            return;
        }
        const apps = getDriver().getRunningApps();
        const currentIds = new Set(apps.map(a => a.id));
        if (this.runningAppsIds) {
            const changed =
                currentIds.size !== this.runningAppsIds.size ||
                [...currentIds].some(id => !this.runningAppsIds!.has(id));
            if (changed) {
                this.runningAppsChanged.dispatch(apps);
            }
        }
        this.runningAppsIds = currentIds;
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
    public async watchWindows(appId: string): Promise<void> {
        const existing = this.windowWatchers.get(appId);
        if (existing) {
            existing.lastAccess = Date.now();
            return;
        }
        const windows = getDriver().getWindows(appId);
        const windowIds = new Set(windows.map(w => w.id));
        const timer = setInterval(() => this.pollWindows(appId), WINDOW_POLL_INTERVAL);
        this.windowWatchers.set(appId, { timer, windowIds, lastAccess: Date.now() });
    }

    @exposed
    public async unwatchWindows(appId: string): Promise<void> {
        this.stopWindowWatcher(appId);
    }

    private stopWindowWatcher(appId: string) {
        const watcher = this.windowWatchers.get(appId);
        if (watcher) {
            clearInterval(watcher.timer);
            this.windowWatchers.delete(appId);
        }
    }

    private pollWindows(appId: string) {
        const watcher = this.windowWatchers.get(appId);
        if (!watcher) return;
        if (Date.now() - watcher.lastAccess > WINDOW_POLL_IDLE_TIMEOUT) {
            this.stopWindowWatcher(appId);
            return;
        }
        const windows = getDriver().getWindows(appId);
        const currentIds = new Set(windows.map(w => w.id));
        const changed =
            currentIds.size !== watcher.windowIds.size ||
            [...currentIds].some(id => !watcher.windowIds.has(id));
        if (changed) {
            watcher.windowIds = currentIds;
            this.windowsChanged.dispatch(appId, windows);
        }
    }

    // ── H.264 Window Streaming ──

    @exposed
    public async startStreamingSession(windowId: string): Promise<StreamingSessionInfo> {
        const driver = getDriver();
        if (isMac) {
            if (!driver.hasScreenRecordingPermission()) {
                throw new Error("Screen recording permission is required. Grant it in System Settings > Privacy & Security > Screen Recording.");
            }
            if (!driver.hasAccessibilityPermission()) {
                throw new Error("Accessibility permission is required for remote control. Grant it in System Settings > Privacy & Security > Accessibility.");
            }
        }

        const numId = isMac ? parseInt(windowId, 10) : Number(windowId);

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
        const result = driver.startH264Stream(numId, (err, frame) => {
            if (err || !frame) return;
            const session = this.windowSessions.get(windowId);
            if (!session || !session.controller) return;

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
            } catch {
                // Stream closed (client disconnected / cancelled) — stop the native encoder
                this.stopStreamingSession(windowId).catch(() => {});
            }
        });

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

        this.windowSessions.delete(windowId);
        const numId = isMac ? parseInt(windowId, 10) : Number(windowId);
        try { getDriver().stopH264Stream(numId); } catch {}
        try { session.controller?.close(); } catch {}
    }

    @exposed
    public async streamControl(windowId: string, fps?: number, quality?: number): Promise<void> {
        const session = this.windowSessions.get(windowId);
        if (session) session.lastHeartbeat = Date.now();

        const numId = isMac ? parseInt(windowId, 10) : Number(windowId);
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
        console.log("AppsService started.");
    }

    @serviceStopMethod
    public async stop() {
        this.stopPolling();
        this.stopPowerBlocker();
        for (const appId of this.windowWatchers.keys()) {
            this.stopWindowWatcher(appId);
        }
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
