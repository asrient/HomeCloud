/**
 * Build script: generates assets/terminal.html with inlined xterm.js + CSS.
 * Run: node scripts/build-terminal-html.js
 */
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const NODE_MODULES = path.join(__dirname, '..', 'node_modules');

const xtermJs = fs.readFileSync(path.join(NODE_MODULES, '@xterm', 'xterm', 'lib', 'xterm.js'), 'utf8');
const fitJs = fs.readFileSync(path.join(NODE_MODULES, '@xterm', 'addon-fit', 'lib', 'addon-fit.js'), 'utf8');
const xtermCss = fs.readFileSync(path.join(NODE_MODULES, '@xterm', 'xterm', 'css', 'xterm.css'), 'utf8');

const html = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="color-scheme" content="dark">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
#terminal { width: 100%; height: 100%; }
.xterm { padding: 4px; }
${xtermCss}
</style>
</head>
<body>
<div id="terminal"></div>
<script>${xtermJs}</script>
<script>${fitJs}</script>
<script>
(function() {
  var term = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, Courier New, monospace',
    theme: {
      background: '#000',
      foreground: '#cccccc',
      cursor: '#ffffff',
      selectionBackground: '#264f78',
    },
    allowProposedApi: true,
  });
  var fitAddon = new FitAddon.FitAddon();
  window._fitAddon = fitAddon;
  term.loadAddon(fitAddon);
  term.open(document.getElementById('terminal'));
  // Force dark keyboard on iOS WebView
  var ta = document.querySelector('.xterm-helper-textarea');
  if (ta) { ta.style.colorScheme = 'dark'; ta.setAttribute('inputmode', 'text'); }
  fitAddon.fit();
  function sendToRN(type, data) {
    var msg = JSON.stringify(Object.assign({ type: type }, data || {}));
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  }
  term.onData(function(data) { sendToRN('input', { data: data }); });
  term.onResize(function(size) { sendToRN('resize', { cols: size.cols, rows: size.rows }); });
  window.addEventListener('resize', function() { fitAddon.fit(); });
  setTimeout(function() {
    fitAddon.fit();
    var dims = fitAddon.proposeDimensions();
    sendToRN('ready', dims ? { cols: dims.cols, rows: dims.rows } : { cols: 80, rows: 24 });
  }, 100);
  function handleMsg(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'output') term.write(msg.data);
      else if (msg.type === 'clear') term.clear();
      else if (msg.type === 'focus') term.focus();
    } catch (e) {}
  }
  window.addEventListener('message', handleMsg);
  document.addEventListener('message', handleMsg);

  // Touch-to-scroll: xterm uses wheel events, not touch, so we bridge them
  var touchStartY = null;
  var cellHeight = 0;
  var accDelta = 0;
  var scrollEl = document.getElementById('terminal');
  scrollEl.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      cellHeight = term._core._renderService.dimensions.css.cell.height || 16;
      accDelta = 0;
    }
  }, { passive: true });
  scrollEl.addEventListener('touchmove', function(e) {
    if (touchStartY !== null && e.touches.length === 1) {
      var dy = touchStartY - e.touches[0].clientY;
      touchStartY = e.touches[0].clientY;
      accDelta += dy;
      var lines = Math.trunc(accDelta / cellHeight);
      if (lines !== 0) {
        term.scrollLines(lines);
        accDelta -= lines * cellHeight;
      }
    }
  }, { passive: true });
  scrollEl.addEventListener('touchend', function() {
    touchStartY = null;
    accDelta = 0;
  }, { passive: true });
})();
</script>
</body>
</html>`;

const outPath = path.join(ASSETS_DIR, 'terminal.html');
fs.writeFileSync(outPath, html);
console.log('Generated', outPath, `(${(html.length / 1024).toFixed(0)}KB)`);
