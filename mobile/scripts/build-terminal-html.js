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
  // Force dark keyboard on iOS WebView; disable IME features for terminal input
  var ta = document.querySelector('.xterm-helper-textarea');
  if (ta) {
    ta.style.colorScheme = 'dark';
    ta.setAttribute('inputmode', 'text');
    ta.setAttribute('autocomplete', 'off');
    ta.setAttribute('autocorrect', 'off');
    ta.setAttribute('autocapitalize', 'off');
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('enterkeyhint', 'send');
  }
  fitAddon.fit();
  function sendToRN(type, data) {
    var msg = JSON.stringify(Object.assign({ type: type }, data || {}));
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
  }
  term.onData(function(data) { sendToRN('input', { data: data }); });
  // Android IME eats Enter through its composition pipeline (needs 3 presses).
  // Intercept it before the IME can buffer it.
  if (ta) {
    ta.addEventListener('beforeinput', function(e) {
      if (e.inputType === 'insertLineBreak') {
        e.preventDefault();
        sendToRN('input', { data: '\\x0d' });
      }
    });
  }
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

  // Touch handling:
  //   tap on terminal       → select word at touch point (or clear if active)
  //   drag on terminal      → scroll (clears any active selection)
  // RN bar provides Cancel / Copy.
  var cellW = 0, cellH = 0;
  var scrollEl = document.getElementById('terminal');
  var startX = null, startY = null, accDelta = 0, moved = false;

  function refreshCell() {
    var d = term._core._renderService.dimensions.css.cell;
    cellW = d.width || 8; cellH = d.height || 16;
  }

  function pointToCell(clientX, clientY) {
    var rect = term.element.getBoundingClientRect();
    var col = Math.max(0, Math.min(term.cols - 1, Math.floor((clientX - rect.left) / cellW)));
    var rowInView = Math.max(0, Math.min(term.rows - 1, Math.floor((clientY - rect.top) / cellH)));
    return { col: col, row: term.buffer.active.viewportY + rowInView };
  }

  var WORD_RE = /[A-Za-z0-9_./~$@-]/;
  function selectWordAt(col, row) {
    var line = term.buffer.active.getLine(row);
    if (!line) return false;
    var text = line.translateToString(false);
    if (col >= text.length || !WORD_RE.test(text[col])) return false;
    var s = col, e = col;
    while (s > 0 && WORD_RE.test(text[s - 1])) s--;
    while (e < text.length - 1 && WORD_RE.test(text[e + 1])) e++;
    term.select(s, row, e - s + 1);
    return true;
  }

  function postSelection() {
    var t = term.getSelection() || '';
    if (t) sendToRN('selection', { text: t });
    else sendToRN('selectionEnd', {});
  }

  function clearSel() {
    term.clearSelection();
    sendToRN('selectionEnd', {});
  }

  scrollEl.addEventListener('touchstart', function(e) {
    if (e.touches.length !== 1) return;
    var t = e.touches[0];
    startX = t.clientX; startY = t.clientY; accDelta = 0; moved = false;
    refreshCell();
  }, { passive: true });

  scrollEl.addEventListener('touchmove', function(e) {
    if (startY === null || e.touches.length !== 1) return;
    var t = e.touches[0];
    if (!moved && (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8)) {
      moved = true;
      if (term.hasSelection()) clearSel();
    }
    var dy = startY - t.clientY;
    startY = t.clientY;
    accDelta += dy;
    var lines = Math.trunc(accDelta / cellH);
    if (lines !== 0) {
      term.scrollLines(lines);
      accDelta -= lines * cellH;
    }
  }, { passive: true });

  scrollEl.addEventListener('touchend', function(e) {
    if (!moved && startX !== null) {
      var t = e.changedTouches[0];
      if (t) {
        var c = pointToCell(t.clientX, t.clientY);
        if (term.hasSelection()) {
          clearSel();
        } else {
          // Defer past the synthetic mousedown/click that touchend triggers,
          // which would otherwise clear our selection via xterm's SelectionService.
          setTimeout(function() {
            if (selectWordAt(c.col, c.row)) {
              sendToRN('selectionStart', {});
              postSelection();
            }
          }, 50);
        }
      }
    }
    startX = null; startY = null; accDelta = 0;
  }, { passive: true });

  // Allow RN to clear selection
  var origHandleMsg = handleMsg;
  function handleMsg2(event) {
    try {
      var msg = JSON.parse(event.data);
      if (msg.type === 'exitSelection') { clearSel(); return; }
    } catch (e) {}
    origHandleMsg(event);
  }
  window.removeEventListener('message', handleMsg);
  document.removeEventListener('message', handleMsg);
  window.addEventListener('message', handleMsg2);
  document.addEventListener('message', handleMsg2);
})();
</script>
</body>
</html>`;

const outPath = path.join(ASSETS_DIR, 'terminal.html');
fs.writeFileSync(outPath, html);
console.log('Generated', outPath, `(${(html.length / 1024).toFixed(0)}KB)`);
