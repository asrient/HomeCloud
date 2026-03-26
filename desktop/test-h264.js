/**
 * test-h264.js — Standalone test for the AppsWin native module H.264 pipeline.
 *
 * Usage:
 *   cd desktop
 *   node test-h264.js [--window <hwndId>] [--duration <seconds>] [--list]
 *
 * Examples:
 *   node test-h264.js --list                  # list running apps and their windows
 *   node test-h264.js                         # auto-pick first window and stream 5s
 *   node test-h264.js --window 1234567 --duration 10
 */

const path = require('path');

// Load the native addon directly
const addon = require('./build/Release/AppsWin.node');

const args = process.argv.slice(2);
const listMode = args.includes('--list');
const windowIdx = args.indexOf('--window');
const durationIdx = args.indexOf('--duration');
const requestedHwnd = windowIdx >= 0 ? args[windowIdx + 1] : null;
const duration = durationIdx >= 0 ? parseInt(args[durationIdx + 1], 10) : 5;

// ── List mode ──
if (listMode) {
    console.log('\n=== Running Apps ===');
    const apps = addon.getRunningApps();
    for (const app of apps) {
        console.log(`  ${app.name} (${app.id})`);
        const wins = addon.getWindows(app.id);
        for (const w of wins) {
            console.log(`    Window: id=${w.id} title="${w.title}" ${w.width}x${w.height} type=${w.type}`);
        }
    }
    console.log(`\nTotal: ${apps.length} apps`);
    process.exit(0);
}

// ── Stream mode ──
async function main() {
    let targetHwnd = requestedHwnd;

    if (!targetHwnd) {
        // Auto-pick: find the first app window that's reasonably sized
        const apps = addon.getRunningApps();
        for (const app of apps) {
            const wins = addon.getWindows(app.id);
            for (const w of wins) {
                if (w.width >= 200 && w.height >= 200 && w.type === 'regular' && !w.isMinimized) {
                    targetHwnd = w.id;
                    console.log(`Auto-selected: "${w.title}" (${w.width}x${w.height}) hwnd=${w.id} app=${app.name}`);
                    break;
                }
            }
            if (targetHwnd) break;
        }
        if (!targetHwnd) {
            console.error('No suitable window found. Use --list to see available windows.');
            process.exit(1);
        }
    }

    const numId = parseInt(targetHwnd);
    console.log(`\nStarting H.264 stream for hwnd=${targetHwnd} (${numId}) duration=${duration}s\n`);

    let frameCount = 0;
    let totalBytes = 0;
    let keyframeCount = 0;
    let firstFrameTime = null;
    let lastFrameTime = null;
    let errors = [];

    const result = addon.startH264Stream(numId, (err, frame) => {
        if (err) {
            errors.push(err.toString ? err.toString() : String(err));
            console.error(`  [ERROR] ${err}`);
            return;
        }
        if (!frame || !frame.data) {
            console.error('  [ERROR] Empty frame received');
            return;
        }

        frameCount++;
        totalBytes += frame.data.length;
        if (frame.isKeyframe) keyframeCount++;
        const now = Date.now();
        if (!firstFrameTime) firstFrameTime = now;
        lastFrameTime = now;

        if (frameCount <= 3 || frameCount % 30 === 0) {
            console.log(`  frame #${frameCount}: ${frame.isKeyframe ? 'KEY' : 'P'} ${frame.data.length}B ${frame.width}x${frame.height} dpi=${frame.dpi} ts=${frame.timestamp.toFixed(1)}`);
        }
    });

    if (!result) {
        console.error('startH264Stream returned null — WGC not available or invalid window');
        process.exit(1);
    }
    console.log(`Stream started: ${result.width}x${result.height} dpi=${result.dpi}\n`);

    // Let it run for the specified duration
    await new Promise(resolve => setTimeout(resolve, duration * 1000));

    console.log('\nStopping stream...');
    addon.stopH264Stream(numId);

    // Wait a bit for any final callbacks
    await new Promise(resolve => setTimeout(resolve, 500));

    // Summary
    const elapsed = lastFrameTime && firstFrameTime ? (lastFrameTime - firstFrameTime) / 1000 : 0;
    const fps = elapsed > 0 ? (frameCount / elapsed).toFixed(1) : '?';
    const kbps = elapsed > 0 ? ((totalBytes * 8 / 1000) / elapsed).toFixed(0) : '?';

    console.log('\n=== Results ===');
    console.log(`  Frames:     ${frameCount} (${keyframeCount} keyframes)`);
    console.log(`  Bytes:      ${(totalBytes / 1024).toFixed(1)} KB`);
    console.log(`  Duration:   ${elapsed.toFixed(2)}s`);
    console.log(`  FPS:        ${fps}`);
    console.log(`  Bitrate:    ${kbps} kbps`);
    console.log(`  Errors:     ${errors.length}`);
    if (errors.length > 0) {
        console.log(`  Error msgs: ${[...new Set(errors)].join(', ')}`);
    }
    console.log(`  Status:     ${frameCount > 1 && errors.length === 0 ? 'PASS ✓' : 'FAIL ✗'}`);

    process.exit(frameCount > 1 && errors.length === 0 ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
