// Glasschat — main process (v1.1)
'use strict';

const {
  app, BrowserWindow, ipcMain, session, shell, dialog, Menu, Tray,
  nativeImage, globalShortcut, clipboard, powerMonitor, screen
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// --showcase renders the real UI over a demo page with invented chats (for README/website screenshots).
const SHOWCASE = process.argv.includes('--showcase');
const SELFTEST = process.argv.includes('--selftest') || SHOWCASE;
if (SELFTEST) app.setPath('userData', path.join(os.tmpdir(), SHOWCASE ? 'glasschat-showcase' : 'glasschat-selftest'));
if (process.env.GX_USER_DATA) app.setPath('userData', process.env.GX_USER_DATA);

const WA_URL = 'https://web.whatsapp.com/';
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' +
  process.versions.chrome.split('.')[0] + '.0.0.0 Safari/537.36';
const TOPBAR = 42;
const SETTINGS_VERSION = 2;

app.userAgentFallback = CHROME_UA;
app.setAppUserModelId('app.glasschat.desktop');

// ---------------------------------------------------------------- settings
const DEFAULTS = {
  settingsVersion: SETTINGS_VERSION,
  theme: 'aurora',
  material: 'acrylic',
  glass: true,
  panelOpacity: 0.5,
  blur: 22,
  accent: '',
  radius: 16,
  font: 'inter',
  uiFont: 'same',
  msgSize: 0,
  wallpaper: '',
  wallpaperDim: 0.35,
  doodle: 0.04,
  bubbleIn: '',
  bubbleOut: '',
  dropMode: 'ask',          // ask | document | media | default
  pasteMode: 'ask',         // ask | document | default  (images pasted into the message box)
  snipMode: 'ask',          // ask | document | media
  autoSend: false,
  sendToMenu: true,
  privacyBlur: false,
  focusMode: false,
  wideChat: false,
  compact: false,
  hideAvatars: false,
  hidePreviews: false,
  squircle: true,
  animations: true,
  formatting: true,
  dnd: false,
  quietHours: false,
  quietFrom: '22:00',
  quietTo: '07:00',
  dndMute: false,
  hideNotifText: false,
  lockEnabled: false,
  lockAfter: 10,            // minutes idle, 0 = only at start
  lockOnMinimize: false,
  pinHash: '',
  pinSalt: '',
  alwaysOnTop: false,
  closeToTray: true,
  startWithWindows: false,
  startMinimized: false,
  hotkey: 'CommandOrControl+Alt+W',
  downloadDir: '',
  zoom: 1,
  spellcheck: true,
  snippets: [
    { name: 'Thanks', text: 'Thank you! I will get back to you shortly.' },
    { name: 'On my way', text: 'On my way, see you in a few minutes.' },
    { name: 'Received', text: 'Received, thanks. I will check and reply soon.' }
  ],
  notes: {},
  scheduled: [],
  customCSS: '',
  extensions: {},
  bounds: null,
  maximized: false
};

const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { ...DEFAULTS };

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
    settings = { ...DEFAULTS, ...raw };
    if ((raw.settingsVersion || 1) < 2) {
      // v1 -> v2: better default font and look
      if (!raw.font || raw.font === 'default') settings.font = 'inter';
      settings.radius = Math.max(settings.radius, 16);
      settings.blur = Math.max(settings.blur, 22);
      settings.settingsVersion = SETTINGS_VERSION;
      saveSettings();
    }
  } catch { settings = { ...DEFAULTS }; }
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
    } catch (e) { console.error('settings save failed', e); }
  }, 200);
}
function publicSettings() {
  const { bounds, maximized, pinHash, pinSalt, ...rest } = settings;
  return { ...rest, hasPin: !!pinHash };
}

// ---------------------------------------------------------------- extensions
const EXT_DIR = () => path.join(app.getPath('userData'), 'extensions');
function ensureExtensionsDir() {
  const dir = EXT_DIR();
  if (fs.existsSync(dir)) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'example-bigger-emoji.css'),
`/* Glasschat user extension (CSS). Every .css / .js file here appears in
   Settings > Extensions. Turn it on there. */
#main [data-testid="msg-container"] img[data-plain-text] { transform: scale(1.15); }
`);
  fs.writeFileSync(path.join(dir, 'example-hello.js'),
`// Glasschat user extension (JavaScript). Runs inside the WhatsApp Web page.
console.log('[Glasschat] example extension loaded');
`);
}
function listExtensions() {
  ensureExtensionsDir();
  return fs.readdirSync(EXT_DIR())
    .filter(f => /\.(css|js)$/i.test(f))
    .map(f => ({ file: f, type: f.toLowerCase().endsWith('.css') ? 'css' : 'js', enabled: !!settings.extensions[f] }));
}

// ---------------------------------------------------------------- page bridge (runs in WhatsApp's own JS world)
// Hands files to WhatsApp's file pickers without the Windows dialog, and filters
// notifications (Do Not Disturb, hidden previews, click-to-focus).
const BRIDGE = `(() => {
  if (window.__gxBridge) return; const gx = window.__gxBridge = { armed: null, dnd: false, hideText: false };
  const proto = HTMLInputElement.prototype;
  const origClick = proto.click, origPicker = proto.showPicker;
  function hand(input) {
    if (input.type !== 'file' || !gx.armed || Date.now() > gx.armed.until) return false;
    const files = gx.armed.files; gx.armed = null;
    const dt = new DataTransfer(); files.forEach(f => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.postMessage({ __gxr: 'consumed', accept: input.accept || '' }, '*');
    return true;
  }
  proto.click = function () { if (hand(this)) return; return origClick.apply(this, arguments); };
  if (origPicker) proto.showPicker = function () { if (hand(this)) return; return origPicker.apply(this, arguments); };
  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || !e.data.__gxc) return;
    const d = e.data;
    if (d.__gxc === 'arm') gx.armed = { files: d.files, until: Date.now() + 8000 };
    else if (d.__gxc === 'disarm') gx.armed = null;
    else if (d.__gxc === 'state') { gx.dnd = !!d.dnd; gx.hideText = !!d.hideText; }
  });
  const N = window.Notification;
  if (N) {
    function GN(title, opts) {
      if (gx.dnd) { const t = new EventTarget(); t.close = () => {}; return t; }
      if (gx.hideText) { title = 'New message'; opts = Object.assign({}, opts, { body: 'Open Glasschat to read it', icon: undefined, image: undefined }); }
      const n = new N(title, opts);
      n.addEventListener('click', () => window.postMessage({ __gxr: 'focus' }, '*'));
      return n;
    }
    GN.prototype = N.prototype;
    GN.requestPermission = N.requestPermission.bind(N);
    Object.defineProperty(GN, 'permission', { get: () => N.permission });
    window.Notification = GN;
  }
})();`;

// ---------------------------------------------------------------- window
let win = null;
let tray = null;
let unread = 0;
let rendererReady = false;
let pendingFiles = [];
let cssKeys = { custom: null, ext: [] };
const readSrc = f => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/^\uFEFF/, '');

function iconPath() {
  const p = path.join(__dirname, '..', 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}

function createWindow() {
  const b = SHOWCASE ? { width: 1440, height: 900 } : (settings.bounds || { width: 1360, height: 880 });
  const material = settings.material !== 'none' ? settings.material : undefined;
  win = new BrowserWindow({
    ...b,
    minWidth: 380,
    minHeight: 480,
    show: false,
    title: 'Glasschat',
    icon: iconPath(),
    backgroundColor: material ? '#00000000' : '#0b141a',
    backgroundMaterial: material,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#e9edef', height: TOPBAR },
    alwaysOnTop: !!settings.alwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: !!settings.spellcheck,
      backgroundThrottling: false
    }
  });
  if (settings.maximized) win.maximize();

  const wc = win.webContents;
  wc.setUserAgent(CHROME_UA);
  wc.setZoomFactor(settings.zoom || 1);

  wc.on('dom-ready', () => { rendererReady = false; injectStyles(); wc.executeJavaScript(BRIDGE).catch(e => console.error('bridge', e)); });
  wc.on('page-title-updated', (e, title) => {
    e.preventDefault();
    const m = /^\((\d+)\)/.exec(title);
    setUnread(m ? parseInt(m[1], 10) : 0);
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (!url.startsWith('https://web.whatsapp.com')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  wc.on('context-menu', (_e, p) => buildContextMenu(p).popup({ window: win }));

  win.once('ready-to-show', () => {
    const hidden = process.argv.includes('--hidden') || (settings.startMinimized && !SELFTEST);
    if (!hidden) win.show();
  });

  const remember = () => {
    if (!win || win.isDestroyed()) return;
    settings.maximized = win.isMaximized();
    if (!settings.maximized && !win.isMinimized() && !mini.on) settings.bounds = win.getBounds();
    saveSettings();
  };
  win.on('resize', remember);
  win.on('move', remember);
  win.on('minimize', () => { if (settings.lockEnabled && settings.lockOnMinimize && settings.pinHash) lockNow(); });
  win.on('close', e => {
    if (!app.isQuitting && settings.closeToTray && !SELFTEST) {
      e.preventDefault(); win.hide();
      if (settings.lockEnabled && settings.lockOnMinimize && settings.pinHash) lockNow();
    }
  });
  win.on('focus', () => win.flashFrame(false));

  if (SHOWCASE) { wc.loadFile(path.join(__dirname, '..', 'showcase', 'mock.html')); runShowcase(); return; }
  wc.loadURL(WA_URL);
  if (SELFTEST) runSelfTest();
}

async function injectStyles() {
  const wc = win.webContents;
  try {
    await wc.insertCSS(readSrc('fonts.css'));
    await wc.insertCSS(readSrc('glass.css') + '\n' + readSrc('ui.css'));
    cssKeys = { custom: null, ext: [] };
    await applyCustomCSS();
    await applyExtensions();
  } catch (e) { console.error('inject failed', e); }
}
async function applyCustomCSS() {
  const wc = win.webContents;
  if (cssKeys.custom) { await wc.removeInsertedCSS(cssKeys.custom).catch(() => {}); cssKeys.custom = null; }
  if (settings.customCSS && settings.customCSS.trim()) cssKeys.custom = await wc.insertCSS(settings.customCSS);
}
async function applyExtensions() {
  const wc = win.webContents;
  for (const k of cssKeys.ext) await wc.removeInsertedCSS(k).catch(() => {});
  cssKeys.ext = [];
  for (const ext of listExtensions()) {
    if (!ext.enabled) continue;
    const src = fs.readFileSync(path.join(EXT_DIR(), ext.file), 'utf8');
    if (ext.type === 'css') cssKeys.ext.push(await wc.insertCSS(src));
    else wc.executeJavaScript(`try{(function(){${src}\n})()}catch(e){console.error('[Glasschat ext ${ext.file}]',e)}`).catch(() => {});
  }
}

// ---------------------------------------------------------------- unread / tray
function badgeImage() {
  const s = 16, buf = Buffer.alloc(s * s * 4);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5), a = Math.max(0, Math.min(1, 7.5 - d));
    const i = (y * s + x) * 4;
    buf[i] = 60; buf[i + 1] = 70; buf[i + 2] = 245; buf[i + 3] = Math.round(a * 255);
  }
  return nativeImage.createFromBitmap(buf, { width: s, height: s });
}
function dndActive() {
  if (settings.dnd) return true;
  if (!settings.quietHours) return false;
  const now = new Date(), cur = now.getHours() * 60 + now.getMinutes();
  const p = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const a = p(settings.quietFrom), b = p(settings.quietTo);
  return a <= b ? (cur >= a && cur < b) : (cur >= a || cur < b);
}
function setUnread(n) {
  const grew = n > unread;
  unread = n;
  if (!win) return;
  win.setTitle(n ? `(${n}) Glasschat` : 'Glasschat');
  win.setOverlayIcon(n ? badgeImage() : null, n ? `${n} unread` : '');
  if (grew && !win.isFocused() && !dndActive()) win.flashFrame(true);
  if (tray) tray.setToolTip(n ? `Glasschat — ${n} unread` : 'Glasschat');
  send('gx:unread', n);
}
function createTray() {
  const ip = iconPath();
  if (!ip) return;
  tray = new Tray(nativeImage.createFromPath(ip).resize({ width: 16, height: 16 }));
  tray.setToolTip('Glasschat');
  tray.on('click', toggleWindow);
  const rebuild = () => tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Glasschat', click: showWindow },
    { label: 'Snip & send screenshot', click: () => { showWindow(); startSnip(); } },
    { label: 'Do not disturb', type: 'checkbox', checked: !!settings.dnd, click: m => { patchSettings({ dnd: m.checked }); } },
    { label: 'Lock now', enabled: !!settings.pinHash, click: lockNow },
    { type: 'separator' },
    { label: 'Settings', click: () => { showWindow(); send('gx:command', 'settings'); } },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  rebuild();
  tray.rebuild = rebuild;
}
function showWindow() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function toggleWindow() { if (!win) return; (win.isVisible() && win.isFocused()) ? win.hide() : showWindow(); }
function send(ch, ...a) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); }

// ---------------------------------------------------------------- lock
let locked = false;
function hashPin(pin, salt) { return crypto.createHash('sha256').update(salt + ':' + pin).digest('hex'); }
function lockNow() { if (!settings.pinHash) return; locked = true; send('gx:lock', true); }
let idleTimer = null;
function startIdleWatch() {
  clearInterval(idleTimer);
  idleTimer = setInterval(() => {
    if (!locked && settings.lockEnabled && settings.pinHash && settings.lockAfter > 0 &&
      powerMonitor.getSystemIdleTime() >= settings.lockAfter * 60) lockNow();
    send('gx:dnd', dndActive());
    if (win) win.webContents.setAudioMuted(!!(settings.dndMute && dndActive()));
  }, 20000);
  powerMonitor.on('lock-screen', () => { if (settings.lockEnabled && settings.pinHash) lockNow(); });
}

// ---------------------------------------------------------------- incoming files (Explorer "Send to", snips, picker)
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', heic: 'image/heic',
  mp4: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', avi: 'video/x-msvideo', webm: 'video/webm', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', pdf: 'application/pdf', zip: 'application/zip',
  rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  psd: 'image/vnd.adobe.photoshop', ai: 'application/postscript', svg: 'image/svg+xml' };
const MAX_FILE = 2 * 1024 * 1024 * 1024;
function filesFromArgs(argv) {
  return argv.slice(1).filter(a => !a.startsWith('--') && a !== '.' && /[\\/]/.test(a))
    .filter(a => { try { return fs.statSync(a).isFile() && path.resolve(a) !== path.resolve(process.execPath); } catch { return false; } });
}
function deliverPaths(paths, kind) {
  const files = [];
  for (const p of paths) {
    const size = fs.statSync(p).size;
    if (size > MAX_FILE) { dialog.showErrorBox('Glasschat', `${path.basename(p)} is larger than WhatsApp's 2 GB limit.`); continue; }
    const ext = path.extname(p).slice(1).toLowerCase();
    files.push({ name: path.basename(p), type: MIME[ext] || 'application/octet-stream', data: fs.readFileSync(p) });
  }
  if (!files.length) return;
  pendingFiles.push({ files, kind });
  flushFiles();
}
function flushFiles() {
  if (!rendererReady || !pendingFiles.length) return;
  showWindow();
  for (const p of pendingFiles) send('gx:files', p);
  pendingFiles = [];
}
function updateSendTo() {
  if (!app.isPackaged || SELFTEST) return;
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Glasschat.lnk');
  try {
    if (settings.sendToMenu) {
      const target = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
      shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'replace' : 'create', { target, icon: target, iconIndex: 0, description: 'Send files with Glasschat (original quality)' });
    } else if (fs.existsSync(lnk)) fs.rmSync(lnk);
  } catch (e) { console.error('sendto', e); }
}

// Snip & send: opens the Windows snipping overlay, waits for a new clipboard image
let snipTimer = null;
function startSnip() {
  clearInterval(snipTimer);
  const sig = img => img.isEmpty() ? '' : crypto.createHash('md5').update(img.toBitmap()).digest('hex');
  const start = sig(clipboard.readImage());
  if (win && settings.alwaysOnTop) win.setAlwaysOnTop(false);
  shell.openExternal('ms-screenclip:');
  const t0 = Date.now();
  snipTimer = setInterval(() => {
    const img = clipboard.readImage();
    const s = sig(img);
    if (s && s !== start) {
      clearInterval(snipTimer);
      if (win && settings.alwaysOnTop) win.setAlwaysOnTop(true);
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      pendingFiles.push({ files: [{ name: `Screenshot ${stamp}.png`, type: 'image/png', data: img.toPNG() }], kind: settings.snipMode });
      flushFiles();
    } else if (Date.now() - t0 > 120000) { clearInterval(snipTimer); if (win && settings.alwaysOnTop) win.setAlwaysOnTop(true); }
  }, 400);
}

// ---------------------------------------------------------------- mini mode
const mini = { on: false, prev: null };
function toggleMini() {
  if (!win) return;
  if (!mini.on) {
    mini.prev = win.isMaximized() ? null : win.getBounds();
    if (win.isMaximized()) win.unmaximize();
    const d = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setBounds({ width: 460, height: 760, x: d.x + d.width - 480, y: d.y + d.height - 780 }, true);
    win.setAlwaysOnTop(true, 'floating');
    mini.on = true;
  } else {
    if (mini.prev) win.setBounds(mini.prev, true);
    win.setAlwaysOnTop(!!settings.alwaysOnTop);
    mini.on = false;
  }
  send('gx:mini', mini.on);
}

// ---------------------------------------------------------------- context menu
function buildContextMenu(p) {
  const t = [];
  if (p.misspelledWord && p.dictionarySuggestions.length) {
    p.dictionarySuggestions.slice(0, 5).forEach(s => t.push({ label: s, click: () => win.webContents.replaceMisspelling(s) }));
    t.push({ label: 'Add to dictionary', click: () => win.webContents.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    t.push({ type: 'separator' });
  }
  if (p.linkURL) {
    t.push({ label: 'Open link in browser', click: () => shell.openExternal(p.linkURL) });
    t.push({ label: 'Copy link', click: () => clipboard.writeText(p.linkURL) });
    t.push({ type: 'separator' });
  }
  if (p.mediaType === 'image' && p.srcURL) {
    t.push({ label: 'Copy image', click: () => win.webContents.copyImageAt(p.x, p.y) });
    t.push({ label: 'Save image as…', click: () => win.webContents.downloadURL(p.srcURL) });
    t.push({ type: 'separator' });
  }
  if (p.isEditable) {
    if (p.selectionText) {
      t.push({ label: 'Bold', accelerator: 'Ctrl+B', click: () => send('gx:command', 'fmt:*') },
        { label: 'Italic', accelerator: 'Ctrl+I', click: () => send('gx:command', 'fmt:_') },
        { label: 'Strikethrough', accelerator: 'Ctrl+Shift+X', click: () => send('gx:command', 'fmt:~') },
        { label: 'Monospace', accelerator: 'Ctrl+Shift+K', click: () => send('gx:command', 'fmt:```') },
        { type: 'separator' });
    }
    t.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      { label: 'Paste as document (original)', click: () => send('gx:command', 'paste-document') },
      { role: 'selectAll' });
  } else if (p.selectionText) {
    t.push({ role: 'copy' });
  }
  if (t.length && t[t.length - 1].type !== 'separator') t.push({ type: 'separator' });
  t.push({ label: 'Snip & send screenshot', click: startSnip });
  t.push({ label: 'Glasschat settings', click: () => send('gx:command', 'settings') });
  t.push({ label: 'Reload', click: () => win.webContents.reload() });
  return Menu.buildFromTemplate(t);
}

// ---------------------------------------------------------------- apply main-side settings
function applyMainSettings(prev) {
  if (!win) return;
  if (prev.material !== settings.material) {
    try {
      win.setBackgroundMaterial(settings.material === 'none' ? 'none' : settings.material);
      win.setBackgroundColor(settings.material === 'none' ? '#0b141a' : '#00000000');
    } catch (e) { console.error(e); }
  }
  if (prev.alwaysOnTop !== settings.alwaysOnTop && !mini.on) win.setAlwaysOnTop(!!settings.alwaysOnTop);
  if (prev.zoom !== settings.zoom) win.webContents.setZoomFactor(settings.zoom || 1);
  if (prev.spellcheck !== settings.spellcheck) win.webContents.session.setSpellCheckerEnabled(!!settings.spellcheck);
  if (prev.startWithWindows !== settings.startWithWindows) applyLoginItem();
  if (prev.hotkey !== settings.hotkey) registerHotkey();
  if (prev.customCSS !== settings.customCSS) applyCustomCSS();
  if (prev.sendToMenu !== settings.sendToMenu) updateSendTo();
  if (JSON.stringify(prev.extensions) !== JSON.stringify(settings.extensions)) applyExtensions();
  if (prev.dnd !== settings.dnd || prev.quietHours !== settings.quietHours || prev.quietFrom !== settings.quietFrom || prev.quietTo !== settings.quietTo || prev.dndMute !== settings.dndMute) {
    send('gx:dnd', dndActive());
    if (tray && tray.rebuild) tray.rebuild();
  }
  if (prev.pinHash !== settings.pinHash && tray && tray.rebuild) tray.rebuild();
  win.webContents.setAudioMuted(!!(settings.dndMute && dndActive()));
}
function patchSettings(patch) {
  const prev = { ...settings };
  settings = { ...settings, ...patch };
  saveSettings();
  applyMainSettings(prev);
  send('gx:settings', publicSettings());
  return publicSettings();
}
function applyLoginItem() {
  if (SELFTEST || !app.isPackaged) return;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.startWithWindows, path: exe, args: ['--hidden'] }); } catch {}
}
function registerHotkey() {
  globalShortcut.unregisterAll();
  if (!settings.hotkey || SELFTEST) return;
  try { globalShortcut.register(settings.hotkey, toggleWindow); } catch (e) { console.error('hotkey', e); }
}

// ---------------------------------------------------------------- IPC
function registerIpc() {
  ipcMain.handle('gx:get-settings', () => ({ settings: publicSettings(), version: app.getVersion(), unread, mini: mini.on, locked, dnd: dndActive() }));
  ipcMain.handle('gx:ready', () => {
    rendererReady = true;
    if (settings.lockEnabled && settings.pinHash && !locked && !SELFTEST && !app.__lockedOnce) { app.__lockedOnce = true; lockNow(); }
    setTimeout(flushFiles, 300);
    return true;
  });
  ipcMain.handle('gx:set', (_e, patch) => {
    delete patch.pinHash; delete patch.pinSalt; delete patch.hasPin;
    return patchSettings(patch);
  });
  ipcMain.handle('gx:set-pin', (_e, pin) => {
    if (!pin) { patchSettings({ pinHash: '', pinSalt: '', lockEnabled: false }); return true; }
    if (!/^\d{4,12}$/.test(pin)) return false;
    const salt = crypto.randomBytes(16).toString('hex');
    patchSettings({ pinHash: hashPin(pin, salt), pinSalt: salt, lockEnabled: true });
    return true;
  });
  let fails = 0, lockUntil = 0;
  ipcMain.handle('gx:unlock', (_e, pin) => {
    if (Date.now() < lockUntil) return { ok: false, wait: Math.ceil((lockUntil - Date.now()) / 1000) };
    if (settings.pinHash && hashPin(String(pin), settings.pinSalt) === settings.pinHash) {
      fails = 0; locked = false; send('gx:lock', false); return { ok: true };
    }
    fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
    return { ok: false };
  });
  ipcMain.handle('gx:lock-now', () => lockNow());
  ipcMain.handle('gx:snip', () => startSnip());
  ipcMain.handle('gx:pick-send', async (_e, kind) => {
    const r = await dialog.showOpenDialog(win, { title: kind === 'media' ? 'Send photos / videos' : 'Send files as documents (original quality)', properties: ['openFile', 'multiSelections'] });
    if (!r.canceled && r.filePaths.length) deliverPaths(r.filePaths, kind);
  });
  ipcMain.handle('gx:reset', () => {
    const keep = { bounds: settings.bounds, snippets: settings.snippets, notes: settings.notes, scheduled: settings.scheduled, pinHash: settings.pinHash, pinSalt: settings.pinSalt, lockEnabled: settings.lockEnabled };
    const prev = { ...settings };
    settings = { ...DEFAULTS, ...keep };
    saveSettings(); applyMainSettings(prev); send('gx:settings', publicSettings());
    return publicSettings();
  });
  ipcMain.handle('gx:pick-wallpaper', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a chat wallpaper', properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const src = r.filePaths[0];
    if (fs.statSync(src).size > 25 * 1024 * 1024) return { error: 'Image is larger than 25 MB.' };
    const name = 'wallpaper' + path.extname(src).toLowerCase();
    for (const f of fs.readdirSync(app.getPath('userData'))) if (/^wallpaper\./.test(f)) fs.rmSync(path.join(app.getPath('userData'), f), { force: true });
    fs.copyFileSync(src, path.join(app.getPath('userData'), name));
    return { name: name + '?' + Date.now() };
  });
  ipcMain.handle('gx:get-wallpaper', () => {
    if (!settings.wallpaper) return '';
    const file = path.join(app.getPath('userData'), settings.wallpaper.split('?')[0]);
    if (!fs.existsSync(file)) return '';
    const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
    return `data:image/${ext};base64,` + fs.readFileSync(file).toString('base64');
  });
  ipcMain.handle('gx:pick-folder', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Save downloads to…', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('gx:open', (_e, what) => {
    const map = {
      downloads: settings.downloadDir || app.getPath('downloads'),
      extensions: (ensureExtensionsDir(), EXT_DIR()),
      data: app.getPath('userData')
    };
    if (map[what]) return shell.openPath(map[what]);
  });
  ipcMain.handle('gx:show-item', (_e, p) => shell.showItemInFolder(p));
  ipcMain.handle('gx:list-extensions', () => listExtensions());
  ipcMain.handle('gx:reload-extensions', () => applyExtensions());
  ipcMain.handle('gx:notify', (_e, { title, body }) => {
    const { Notification } = require('electron');
    if (Notification.isSupported()) { const n = new Notification({ title, body, icon: iconPath() }); n.on('click', showWindow); n.show(); }
  });
  ipcMain.handle('gx:dark', (_e, dark) => {
    try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: dark ? '#e9edef' : '#1f2c34', height: TOPBAR }); } catch {}
  });
  ipcMain.handle('gx:win', (_e, action) => {
    if (!win) return;
    const wc = win.webContents;
    switch (action) {
      case 'show': showWindow(); break;
      case 'mini': toggleMini(); break;
      case 'top': patchSettings({ alwaysOnTop: !settings.alwaysOnTop }); break;
      case 'zoom-in': case 'zoom-out': case 'zoom-reset': {
        const z = action === 'zoom-reset' ? 1 : Math.round(Math.min(2, Math.max(0.6, (settings.zoom || 1) + (action === 'zoom-in' ? 0.1 : -0.1))) * 10) / 10;
        patchSettings({ zoom: z }); return z;
      }
      case 'reload': wc.reload(); break;
      case 'hard-reload': wc.session.clearCache().then(() => wc.reloadIgnoringCache()); break;
      case 'devtools': wc.toggleDevTools(); break;
      case 'quit': app.isQuitting = true; app.quit(); break;
    }
  });
}

// ---------------------------------------------------------------- session
function setupSession() {
  const ses = session.defaultSession;
  ses.setUserAgent(CHROME_UA);
  const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'mediaKeySystem', 'speaker-selection']);
  ses.setPermissionRequestHandler((_wc, perm, cb) => cb(allowed.has(perm)));
  ses.setPermissionCheckHandler((_wc, perm) => allowed.has(perm));
  try { ses.setSpellCheckerLanguages(['en-US']); } catch {}

  ses.on('will-download', (_e, item) => {
    if (settings.downloadDir && fs.existsSync(settings.downloadDir)) {
      const base = item.getFilename();
      const ext = path.extname(base), stem = path.basename(base, ext);
      let target = path.join(settings.downloadDir, base), i = 1;
      while (fs.existsSync(target)) target = path.join(settings.downloadDir, `${stem} (${i++})${ext}`);
      item.setSavePath(target);
    }
    item.once('done', (_ev, state) => {
      if (state === 'completed') send('gx:downloaded', { path: item.getSavePath(), name: path.basename(item.getSavePath()) });
    });
  });
}

// ---------------------------------------------------------------- self test
function runShowcase() {
  const out = process.env.GX_SHOWCASE_DIR || path.join(process.cwd(), 'showcase-out');
  fs.mkdirSync(out, { recursive: true });
  const wc = win.webContents;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const js = code => wc.executeJavaScript(code).catch(() => {});
  const shot = async name => { await wait(750); const img = await wc.capturePage(); fs.writeFileSync(path.join(out, name), img.toPNG()); };
  const cmd = c => send('gx:command', c);
  wc.once('did-finish-load', async () => {
    await wait(2500);
    patchSettings({ theme: 'aurora', accent: '', font: 'inter', privacyBlur: false, dropMode: 'ask' });
    await wait(800);
    await shot('01-main.png');
    cmd('settings'); await shot('02-settings.png'); cmd('settings');
    cmd('demo-drop'); await shot('03-send-as-document.png'); cmd('demo-drop-off');
    cmd('palette'); await shot('04-command-palette.png'); cmd('palette-off');
    cmd('panel:snips'); await shot('05-quick-replies.png'); cmd('panel:off');
    cmd('panel:sched'); await shot('06-schedule.png'); cmd('panel:off');
    cmd('panel:notes'); await shot('07-notes.png'); cmd('panel:off');
    patchSettings({ privacyBlur: true }); await shot('08-privacy-blur.png'); patchSettings({ privacyBlur: false });
    cmd('demo-lock'); await shot('09-app-lock.png'); cmd('demo-lock-off');
    patchSettings({ theme: 'rose' }); await shot('10-theme-rose.png');
    patchSettings({ theme: 'midnight' }); await shot('11-theme-midnight.png');
    await js(`document.body.classList.remove('dark')`);
    patchSettings({ theme: 'ocean' }); await shot('12-light-ocean.png');
    await js(`document.body.classList.add('dark')`);
    patchSettings({ theme: 'aurora' }); cmd('settings'); cmd('tab:sending'); await shot('13-settings-sending.png');
    cmd('tab:privacy'); await shot('14-settings-privacy.png'); cmd('settings');
    app.isQuitting = true; app.quit();
  });
  setTimeout(() => { app.isQuitting = true; app.quit(); }, 90000);
}

function runSelfTest() {
  const out = process.env.GX_SELFTEST_DIR || process.cwd();
  const wc = win.webContents;
  const shot = async name => { const img = await wc.capturePage(); fs.writeFileSync(path.join(out, name), img.toPNG()); };
  wc.once('did-finish-load', async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    await wait(9000);
    await shot('selftest-1-main.png');
    send('gx:command', 'settings'); await wait(1500); await shot('selftest-2-settings.png');
    send('gx:command', 'settings'); send('gx:command', 'demo-drop'); await wait(1200); await shot('selftest-3-drop.png');
    send('gx:command', 'demo-drop-off'); send('gx:command', 'palette'); await wait(1000); await shot('selftest-4-palette.png');
    send('gx:command', 'palette-off'); send('gx:command', 'demo-lock'); await wait(1000); await shot('selftest-5-lock.png');
    const errs = await wc.executeJavaScript('document.documentElement.dataset.gxErrors||"[]"').catch(() => '[]');
    const bridge = await wc.executeJavaScript('!!window.__gxBridge').catch(() => 'n/a');
    fs.writeFileSync(path.join(out, 'selftest-log.txt'),
      `title=${wc.getTitle()}\nurl=${wc.getURL()}\nui=${await wc.executeJavaScript('!!document.getElementById("gx-root")').catch(() => 'n/a')}\nbridge=${bridge}\nerrors=${errs}\n`);
    app.isQuitting = true; app.quit();
  });
  setTimeout(() => { app.isQuitting = true; app.quit(); }, 70000);
}

// ---------------------------------------------------------------- lifecycle
if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgs(argv);
    if (files.length) deliverPaths(files, 'document'); else showWindow();
  });
  app.whenReady().then(() => {
    loadSettings();
    ensureExtensionsDir();
    Menu.setApplicationMenu(null);
    setupSession();
    registerIpc();
    createWindow();
    createTray();
    registerHotkey();
    applyLoginItem();
    updateSendTo();
    startIdleWatch();
    const startFiles = filesFromArgs(process.argv);
    if (startFiles.length) deliverPaths(startFiles, 'document');
  });
  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
