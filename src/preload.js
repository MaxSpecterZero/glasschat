// Glasschat v1.1 — preload (isolated world on web.whatsapp.com)
'use strict';
const { ipcRenderer } = require('electron');

window.__gxErrors = [];
const logErr = (where, e) => { try {
  window.__gxErrors.push(where + ': ' + (e && e.message || e));
  document.documentElement.dataset.gxErrors = JSON.stringify(window.__gxErrors.slice(-20));
  console.error('[Glasschat]', where, e); } catch {} };

let S = {};
let VERSION = '';
let wallpaperURL = '';
let isDark = true;
let locked = false;
let dndOn = false;

// ------------------------------------------------------------------ themes & fonts
const PRESETS = {
  aurora:   { name: 'Aurora',   accent: '#2ee6b0', lightAccent: '#0f9e78', dark: '#0d1424', light: '#eef6f4', sw: 'linear-gradient(135deg,#0d1424,#1b3a4b 55%,#2ee6b0)' },
  midnight: { name: 'Midnight', accent: '#8b96ff', lightAccent: '#4f5bd5', dark: '#0a0d1f', light: '#eef0ff', sw: 'linear-gradient(135deg,#05071a,#1c2160 60%,#8b96ff)' },
  rose:     { name: 'Rosé',     accent: '#ff6fa5', lightAccent: '#d63f7a', dark: '#1d0f19', light: '#fff1f6', sw: 'linear-gradient(135deg,#1d0f19,#5a2142 55%,#ff9fc4)' },
  ocean:    { name: 'Ocean',    accent: '#36b9ff', lightAccent: '#0a84c9', dark: '#071a28', light: '#ecf7ff', sw: 'linear-gradient(135deg,#041422,#0d4a6e 55%,#5fd0ff)' },
  ember:    { name: 'Ember',    accent: '#ff8a3d', lightAccent: '#d9621a', dark: '#1c120a', light: '#fff4ea', sw: 'linear-gradient(135deg,#1c120a,#6b2f12 55%,#ffb46b)' },
  forest:   { name: 'Forest',   accent: '#7ed957', lightAccent: '#3f9a1f', dark: '#0d1a10', light: '#f0f9ec', sw: 'linear-gradient(135deg,#08130a,#1f4a23 55%,#a6eb7c)' },
  violet:   { name: 'Violet',   accent: '#b78cff', lightAccent: '#7c4ddb', dark: '#140d22', light: '#f5f0ff', sw: 'linear-gradient(135deg,#0f0a1c,#3b2370 55%,#c9a6ff)' },
  mono:     { name: 'Graphite', accent: '#dfe5ea', lightAccent: '#2b3440', dark: '#121416', light: '#f3f4f5', sw: 'linear-gradient(135deg,#0c0d0f,#3a3f45 55%,#d6dde3)' },
  classic:  { name: 'Classic',  accent: '#25d366', lightAccent: '#08a05a', dark: '#0b141a', light: '#f0f2f5', sw: 'linear-gradient(135deg,#0b141a,#103529 55%,#25d366)' }
};
const FB = '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif';
const FONTS = {
  inter:    { label: 'Inter', note: 'Crisp and neutral (default)', stack: `"Inter Variable", ${FB}` },
  segoe:    { label: 'Segoe UI', note: 'Native Windows 11', stack: `"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif` },
  jakarta:  { label: 'Plus Jakarta', note: 'Friendly, rounded', stack: `"Plus Jakarta Sans Variable", ${FB}` },
  figtree:  { label: 'Figtree', note: 'Soft geometric', stack: `"Figtree Variable", ${FB}` },
  manrope:  { label: 'Manrope', note: 'Modern, compact', stack: `"Manrope Variable", ${FB}` },
  outfit:   { label: 'Outfit', note: 'Bold geometric', stack: `"Outfit Variable", ${FB}` },
  whatsapp: { label: 'WhatsApp', note: 'Original Roboto', stack: '' }
};
const hexRgb = h => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})/i.exec(h || '') || [0, '00', '00', '00']; return [1, 2, 3].map(i => parseInt(m[i], 16)); };
const lum = h => { const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };

// ------------------------------------------------------------------ DOM helpers (no innerHTML: WhatsApp enforces Trusted Types)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
// replaceChildren that flattens arrays and skips null/false (prevents stray "null" text)
function setKids(el, ...kids) {
  el.replaceChildren(...kids.flat(9).filter(k => k != null && k !== false));
}
const ICONS = {
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M21 21l-4.3-4.3'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  doc: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M9 13h6', 'M9 17h6'],
  image: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M8.5 10a1.5 1.5 0 1 0 0-3a1.5 1.5 0 0 0 0 3z', 'M21 15l-5-5L5 21'],
  eyeoff: ['M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94', 'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19', 'M1 1l22 22', 'M14.12 14.12a3 3 0 1 1-4.24-4.24'],
  focus: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M9 3v18'],
  pin: ['M12 17v5', 'M9 10.76V4h6v6.76a2 2 0 0 0 1.11 1.79l1.78.9A2 2 0 0 1 19 15.24V17H5v-1.76a2 2 0 0 1 1.11-1.79l1.78-.9A2 2 0 0 0 9 10.76z'],
  zap: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z'],
  palette: ['M12 2a10 10 0 1 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0 0 22 9.8C22 5.5 17.5 2 12 2z', 'M7.5 10.5h.01', 'M12 7.5h.01', 'M16.5 10.5h.01'],
  x: ['M18 6L6 18', 'M6 6l12 12'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  upload: ['M12 15V3', 'M7 8l5-5 5 5', 'M5 21h14'],
  clip: ['M9 2h6v4H9z', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'],
  mini: ['M3 5h18v14H3z', 'M13 12h6v5h-6z'],
  refresh: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
  check: ['M20 6L9 17l-5-5'],
  code: ['M16 18l6-6-6-6', 'M8 6l-6 6 6 6'],
  wide: ['M3 12h18', 'M7 8l-4 4 4 4', 'M17 8l4 4-4 4'],
  belloff: ['M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5', 'M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7', 'M10.3 21a1.94 1.94 0 0 0 3.4 0', 'M2 2l20 20'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  lock: ['M7 11V7a5 5 0 0 1 10 0v4', 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z'],
  scissors: ['M6 9a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6z', 'M20 4L8.12 15.88', 'M14.47 14.48L20 20', 'M8.12 8.12L12 12'],
  note: ['M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z', 'M15 3v5a1 1 0 0 0 1 1h5', 'M7 13h6', 'M7 17h10'],
  clock: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 7v5l3 2'],
  paperclip: ['M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  type: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16']
};
function icon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'gx-i'); svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name] || []) { const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); svg.append(p); }
  return svg;
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 2500, step = 50) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(step); }
  return null;
}
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';

// ------------------------------------------------------------------ settings
const set = patch => ipcRenderer.invoke('gx:set', patch);
const win = action => ipcRenderer.invoke('gx:win', action);

function detectDark() {
  const b = document.body;
  if (!b) return window.matchMedia('(prefers-color-scheme: dark)').matches;
  return b.classList.contains('dark') || document.documentElement.classList.contains('dark');
}

function applyTheme() {
  const root = document.documentElement;
  const p = PRESETS[S.theme] || PRESETS.aurora;
  isDark = detectDark();
  const accent = S.accent || (isDark ? p.accent : (p.lightAccent || p.accent));
  const tint = isDark ? p.dark : p.light;
  const st = root.style;
  st.setProperty('--gx-tint-rgb', hexRgb(tint).join(', '));
  st.setProperty('--gx-alpha', S.glass ? String(S.panelOpacity) : '1');
  st.setProperty('--gx-blur', S.blur + 'px');
  st.setProperty('--gx-accent', accent);
  st.setProperty('--gx-accent-rgb', hexRgb(accent).join(', '));
  st.setProperty('--gx-on-accent', lum(accent) > .35 ? '#08130f' : '#ffffff');
  st.setProperty('--gx-radius', S.radius + 'px');
  st.setProperty('--gx-wall-dim', String(S.wallpaperDim));
  st.setProperty('--gx-doodle', String(S.doodle));
  const f = FONTS[S.font] || FONTS.inter;
  if (f.stack) st.setProperty('--gx-font', f.stack); else st.removeProperty('--gx-font');
  st.setProperty('--gx-ui-font', f.stack || FONTS.inter.stack);
  st.setProperty('--gx-msg-size', (S.msgSize || 14.5) + 'px');
  if (wallpaperURL) st.setProperty('--gx-wall', `url("${wallpaperURL}")`); else st.removeProperty('--gx-wall');
  if (S.bubbleIn) st.setProperty('--gx-bubble-in', S.bubbleIn); else st.removeProperty('--gx-bubble-in');
  if (S.bubbleOut) st.setProperty('--gx-bubble-out', S.bubbleOut); else st.removeProperty('--gx-bubble-out');
  const cls = {
    'gx-glass': S.glass, 'gx-light': !isDark, 'gx-wall': !!wallpaperURL,
    'gx-privacy': S.privacyBlur, 'gx-focus': S.focusMode, 'gx-wide': S.wideChat, 'gx-compact': S.compact,
    'gx-noavatar': S.hideAvatars, 'gx-nopreview': S.hidePreviews, 'gx-squircle': S.squircle, 'gx-anim': S.animations,
    'gx-font': !!f.stack, 'gx-msgsize': !!S.msgSize, 'gx-locked': locked
  };
  for (const [c, on] of Object.entries(cls)) root.classList.toggle(c, !!on);
  ipcRenderer.invoke('gx:dark', isDark);
  pushBridgeState();
  refreshBar();
}
function pushBridgeState() {
  window.postMessage({ __gxc: 'state', dnd: dndOn, hideText: !!(S.hideNotifText || locked) }, '*');
}
async function loadWallpaper() { wallpaperURL = S.wallpaper ? await ipcRenderer.invoke('gx:get-wallpaper') : ''; }

// ------------------------------------------------------------------ toasts
function toast(msg, opts = {}) {
  const host = $('#gx-toasts'); if (!host) return;
  const t = h('div', { class: 'gx-toast gx-panel' + (opts.error ? ' err' : ''), role: 'status' },
    icon(opts.error ? 'x' : (opts.icon || 'check')), h('span', null, msg),
    opts.action ? h('button', { class: 'gx-act small', onclick: () => { opts.action.run(); t.remove(); } }, opts.action.label) : null);
  host.append(t);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => t.remove(), opts.ms || 4000);
}

// ------------------------------------------------------------------ WhatsApp helpers (2026 layout)
const svgTitle = el => (el.querySelector('svg title') || {}).textContent || '';
function chatOpen() { return !!$('#main footer'); }
function chatTitle() {
  const t = $('#main [data-testid="conversation-info-header-chat-title"]') || $('#main header [data-testid="conversation-info-header"] span[dir="auto"]');
  return t ? t.textContent.trim() : '';
}
function attachButton() {
  const direct = $('#main footer button[aria-label="Attach"]');
  if (direct) return direct;
  const byIcon = $$('#main footer button, #main footer [role="button"]').find(b => /attach|plus|clip/i.test(svgTitle(b) + ' ' + (b.getAttribute('data-icon') || '')));
  if (byIcon) return byIcon;
  const old = $('#main footer [data-icon="plus-rounded"], #main footer [data-icon="attach-menu-plus"], #main footer [data-icon="clip"], #main footer [title="Attach"]');
  return old ? (old.closest('button,[role="button"]') || old) : null;
}
function menuItem(kind) {
  const items = $$('[role="menuitem"], [role="application"] li [role="button"]');
  const t = el => (svgTitle(el) + ' ' + (el.getAttribute('aria-label') || '') + ' ' + el.textContent).toLowerCase();
  if (kind === 'document') return items.find(el => /description|ic-document|\bdocument\b/.test(t(el)));
  return items.find(el => /ic-filter|photos|gallery|image/.test(t(el)) && !/camera|sticker/.test(t(el)));
}
function composeBox() {
  return $('#main [data-testid="conversation-compose-box-input"]') || $('#main footer [contenteditable="true"][role="textbox"]') || $('#main footer [contenteditable="true"]');
}
function sendButton() {
  return $('#main footer button[aria-label="Send"]') || $$('#main footer button, #main footer [role="button"]').find(b => /send/i.test(svgTitle(b)));
}
function realClick(el) {
  const r = el.getBoundingClientRect();
  const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'mouse', isPrimary: true })); el.dispatchEvent(new MouseEvent('mousedown', o));
  el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'mouse', isPrimary: true })); el.dispatchEvent(new MouseEvent('mouseup', o));
  el.dispatchEvent(new MouseEvent('click', o));
}
function escapeKey() {
  const t = document.activeElement || document.body;
  t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true }));
}

// ------------------------------------------------------------------ sending files
let consumedWaiter = null;
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.__gxr) return;
  if (e.data.__gxr === 'consumed' && consumedWaiter) { consumedWaiter(e.data); consumedWaiter = null; }
  if (e.data.__gxr === 'focus') win('show');
});
const isMedia = f => /^(image|video)\//.test(f.type) && !/svg|photoshop|heic/.test(f.type);
let busy = false;

async function sendFiles(files, kind = 'document') {
  files = Array.from(files || []).filter(Boolean);
  if (!files.length) return;
  if (!chatOpen()) { holdPending(files); return; }
  if (busy) { toast('Still attaching the previous files…', { error: true }); return; }
  if (kind === 'media' && !files.every(isMedia)) {
    kind = 'document';
    toast('Some files are not photos or videos, so everything is sent as documents.', { icon: 'doc', ms: 5000 });
  }
  busy = true;
  try {
    const consumed = new Promise(r => { consumedWaiter = r; setTimeout(() => r(null), 5000); });
    window.postMessage({ __gxc: 'arm', files }, '*');
    const btn = attachButton();
    if (!btn) throw new Error('WhatsApp\'s attach button was not found');
    realClick(btn);
    const item = await waitFor(() => menuItem(kind), 3000);
    if (!item) { escapeKey(); throw new Error('the attach menu did not open'); }
    realClick(item);
    const ok = await consumed;
    if (!ok) throw new Error('WhatsApp did not accept the files');
    clearPending();
    const label = kind === 'document' ? 'as document' + (files.length > 1 ? 's' : '') + ' · original quality' : 'as photo/video';
    toast(`${files.length} file${files.length > 1 ? 's' : ''} attached ${label}. Add a caption or press Enter.`, { icon: kind === 'document' ? 'doc' : 'image' });
    if (S.autoSend) await autoSend();
  } catch (e) {
    window.postMessage({ __gxc: 'disarm' }, '*');
    logErr('sendFiles', e);
    toast('Could not attach: ' + e.message + '. Try again, or use the paperclip button.', { error: true, ms: 7000 });
  } finally { busy = false; }
}
async function autoSend() {
  const btn = await waitFor(() => $$('[aria-label="Send"], [role="button"]').filter(el => !el.closest('#main footer') && (el.getAttribute('aria-label') === 'Send' || /send/i.test(svgTitle(el)))).pop(), 10000, 120);
  if (btn) { await sleep(250); realClick(btn.closest('button,[role="button"]') || btn); }
}

// pending files (when no chat is open)
let pending = [];
function holdPending(files) {
  pending = files;
  ui.pendingLabel.textContent = `${files.length} file${files.length > 1 ? 's' : ''} ready — open a chat, then`;
  ui.pending.classList.add('on');
}
function clearPending() { pending = []; ui.pending.classList.remove('on'); }

// chooser overlay (drop, paste, Send to, snips)
let chooser = null; // { files } when choosing outside a drag
function showChooser(files, mode) {
  setKids(ui.files, ...(files || []).slice(0, 12).map(f => h('span', { class: 'gx-chip' }, `${f.name} · ${fmtSize(f.size)}`)),
    ...(files && files.length > 12 ? [h('span', { class: 'gx-chip' }, `+${files.length - 12} more`)] : []));
  for (const t of [ui.tileDoc, ui.tileMedia]) { const old = t.querySelector('.gx-tag'); if (old) old.remove(); }
  const def = mode || S.dropMode;
  if (def === 'document') ui.tileDoc.prepend(h('span', { class: 'gx-tag' }, 'Default'));
  if (def === 'media') ui.tileMedia.prepend(h('span', { class: 'gx-tag' }, 'Default'));
  const allMedia = files && files.length && files.every(isMedia);
  ui.tileMedia.style.opacity = files && files.length && !allMedia ? '.45' : '';
  ui.dropHint.textContent = files ? 'Click a choice · Esc to cancel' : (S.dropMode === 'ask' ? 'Drop on a choice · drop anywhere else to cancel' : 'Drop anywhere for the default, or on a choice');
  ui.drop.classList.add('on');
}
function hideChooser() { ui.drop.classList.remove('on'); chooser = null; ui.tileDoc.classList.remove('hot'); ui.tileMedia.classList.remove('hot'); }
function offerFiles(files, mode) {
  files = Array.from(files || []);
  if (!files.length) return;
  if (mode === 'document' || mode === 'media') return sendFiles(files, mode);
  chooser = { files };
  showChooser(files, mode);
}

async function pasteAsDocument() {
  try {
    const items = await navigator.clipboard.read();
    const files = [];
    for (const it of items) {
      const type = it.types.find(t => t.startsWith('image/')) || it.types.find(t => !/^text\//.test(t));
      if (!type) continue;
      const blob = await it.getType(type);
      const ext = (type.split('/')[1] || 'bin').replace('jpeg', 'jpg').replace(/\+.*/, '');
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      files.push(new File([blob], `Pasted ${stamp}${files.length ? '-' + (files.length + 1) : ''}.${ext}`, { type }));
    }
    if (!files.length) { toast('The clipboard has no image to paste.', { error: true }); return; }
    await sendFiles(files, 'document');
  } catch (e) { logErr('paste', e); toast('Could not read the clipboard: ' + e.message, { error: true }); }
}

function insertText(text) {
  const box = composeBox();
  if (!box) { toast('Open a chat first.', { error: true }); return false; }
  box.focus();
  const sel = window.getSelection();
  if (!box.contains(sel.anchorNode)) { const r = document.createRange(); r.selectNodeContents(box); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  document.execCommand('insertText', false, text);
  return true;
}
function wrapSelection(mark) {
  const box = composeBox(); const sel = window.getSelection();
  if (!box || !box.contains(sel.anchorNode)) return false;
  const text = sel.toString();
  if (!text) { document.execCommand('insertText', false, mark + mark); return true; }
  const lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
  document.execCommand('insertText', false, lead + mark + text.trim() + mark + trail);
  return true;
}

function chatRows() {
  return $$('#pane-side [role="row"]').map(r => ({ r, top: r.getBoundingClientRect().top })).sort((a, b) => a.top - b.top).map(x => x.r);
}
function jumpToChat(n) {
  const row = chatRows()[n - 1]; if (!row) return;
  realClick(row.querySelector('[data-testid="cell-frame-container"]') || row);
}
async function openChatByName(name) {
  if (chatTitle() === name) return true;
  const find = () => $$('[data-testid="cell-frame-container"]').find(c => { const t = c.querySelector('[data-testid="cell-frame-title"] span[title]'); return t && t.getAttribute('title') === name; });
  let cell = find();
  if (!cell) {
    const search = $('#side [contenteditable="true"]');
    if (!search) return false;
    search.focus(); document.execCommand('selectAll'); document.execCommand('insertText', false, name);
    cell = await waitFor(find, 4000, 150);
  }
  if (!cell) return false;
  realClick(cell);
  const ok = await waitFor(() => chatTitle() === name, 4000, 100);
  const search = $('#side [contenteditable="true"]');
  if (search && search.textContent) { search.focus(); document.execCommand('selectAll'); document.execCommand('delete'); }
  return !!ok;
}
async function sendTextTo(chat, text) {
  if (!(await openChatByName(chat))) return false;
  await sleep(400);
  if (!insertText(text)) return false;
  const btn = await waitFor(sendButton, 3000);
  if (btn) { realClick(btn); return true; }
  const box = composeBox();
  box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  return true;
}

// ------------------------------------------------------------------ overlay UI
let ui = {};
function buildUI() {
  if ($('#gx-root')) return;
  const tool = (name, tip, onclick, extra = '') => h('button', { class: 'gx-btn ' + extra, 'data-tip': tip, 'aria-label': tip, onclick }, icon(name));

  ui.unread = h('span', { class: 'gx-pill' });
  ui.chat = h('span', { class: 'gx-chat' });
  ui.tSend = h('button', { class: 'gx-btn accent', 'data-tip': 'Send files as documents, original quality  (Ctrl+Shift+D)', onclick: () => ipcRenderer.invoke('gx:pick-send', 'document') }, icon('paperclip'), 'Send files');
  ui.tSnip = tool('scissors', 'Snip & send screenshot  (Ctrl+Shift+S)', () => ipcRenderer.invoke('gx:snip'), 'gx-opt');
  ui.tDrop = tool('doc', 'Drop mode', () => cycleDrop(), 'gx-opt gx-opt2');
  ui.tSnips = tool('zap', 'Quick replies  (Ctrl+Shift+Q)', () => togglePanel('snips'));
  ui.tNotes = tool('note', 'Private chat notes  (Ctrl+Shift+N)', () => togglePanel('notes'), 'gx-opt');
  ui.tSched = tool('clock', 'Schedule a message', () => togglePanel('sched'), 'gx-opt gx-opt2');
  ui.tPrivacy = tool('eyeoff', 'Privacy blur  (Ctrl+Shift+P)', () => set({ privacyBlur: !S.privacyBlur }));
  ui.tDnd = tool('belloff', 'Do not disturb', () => set({ dnd: !S.dnd }), 'gx-opt');
  ui.tLock = tool('lock', 'App lock  (Ctrl+L)', () => S.hasPin ? ipcRenderer.invoke('gx:lock-now') : openDrawer('privacy'), 'gx-opt gx-opt2');
  ui.tFocus = tool('focus', 'Focus mode  (Ctrl+Shift+F)', () => set({ focusMode: !S.focusMode }), 'gx-opt gx-opt2');
  ui.tTheme = tool('palette', 'Next theme', () => nextTheme(), 'gx-opt gx-opt2');
  ui.tTop = tool('pin', 'Always on top  (Ctrl+Shift+T)', () => win('top'), 'gx-opt gx-opt2');
  ui.tMini = tool('mini', 'Mini mode  (Ctrl+Shift+M)', () => win('mini'));
  ui.tSet = tool('sliders', 'Settings  (Ctrl+,)', () => toggleDrawer());
  const sep = () => h('i', { class: 'gx-sep' });

  const bar = h('div', { id: 'gx-bar' },
    h('div', { class: 'gx-brand' }, h('i', { class: 'gx-logo' }), h('span', { class: 'gx-name' }, 'Glasschat'), ui.unread, ui.chat),
    h('div', { class: 'gx-search', role: 'button', tabindex: '0', onclick: () => openPalette(), onkeydown: e => e.key === 'Enter' && openPalette() },
      icon('search'), h('span', null, 'Search actions, themes, quick replies…'), h('kbd', null, 'Ctrl K')),
    h('div', { class: 'gx-tools' }, ui.tSend, ui.tSnip, ui.tDrop, sep(), ui.tSnips, ui.tNotes, ui.tSched, sep(),
      ui.tPrivacy, ui.tDnd, ui.tLock, ui.tFocus, sep(), ui.tTheme, ui.tTop, ui.tMini, ui.tSet));

  ui.scrim = h('div', { id: 'gx-scrim', onclick: () => toggleDrawer(false) });
  ui.tabs = h('nav', { id: 'gx-tabs' });
  ui.body = h('div', { id: 'gx-body' });
  ui.drawer = h('aside', { id: 'gx-drawer', class: 'gx-panel', 'aria-label': 'Glasschat settings' },
    h('header', null, h('h2', null, 'Customize'), h('button', { class: 'gx-btn', 'aria-label': 'Close', onclick: () => toggleDrawer(false) }, icon('x'))),
    ui.tabs, ui.body);

  ui.palInput = h('input', { placeholder: 'Type a command, theme or quick reply…', spellcheck: 'false', oninput: () => { palSel = 0; renderPalette(); }, onkeydown: paletteKeys });
  ui.palList = h('ul');
  ui.palette = h('div', { id: 'gx-palette', class: 'gx-panel' }, h('div', { class: 'gx-pin' }, icon('search'), ui.palInput, h('kbd', null, 'Esc')), ui.palList);

  const floatPanel = (id, ic, title, body, extra) => h('div', { id, class: 'gx-float gx-panel' },
    h('header', null, icon(ic), h('span', null, title), extra, h('button', { class: 'gx-btn', 'aria-label': 'Close', onclick: () => togglePanel(null) }, icon('x'))), body);
  ui.snipList = h('div', { class: 'gx-list' });
  ui.snips = floatPanel('gx-snips', 'zap', 'Quick replies', ui.snipList,
    h('button', { class: 'gx-btn', 'aria-label': 'Edit quick replies', onclick: () => { togglePanel(null); openDrawer('sending'); } }, icon('sliders')));
  ui.notesTitle = h('span', null, 'Notes');
  ui.notesText = h('textarea', { placeholder: 'Private notes for this chat. Only stored on this PC.', spellcheck: 'true' });
  ui.notes = h('div', { id: 'gx-notes', class: 'gx-float gx-panel' },
    h('header', null, icon('note'), ui.notesTitle, h('button', { class: 'gx-btn', 'aria-label': 'Close', onclick: () => togglePanel(null) }, icon('x'))),
    h('div', { class: 'gx-pad' }, ui.notesText, h('p', { class: 'gx-note' }, 'Saved automatically. Notes follow the chat name.')));
  let ntmr;
  ui.notesText.addEventListener('input', () => { clearTimeout(ntmr); const key = ui.notesText.dataset.chat; const v = ui.notesText.value; ntmr = setTimeout(() => { const notes = { ...(S.notes || {}) }; if (v.trim()) notes[key] = v; else delete notes[key]; set({ notes }); }, 500); });
  ui.schedBody = h('div', { class: 'gx-pad' });
  ui.sched = floatPanel('gx-sched', 'clock', 'Scheduled messages', ui.schedBody);

  const tile = (kind, ic, title, sub) => h('div', { class: 'gx-tile gx-panel', 'data-kind': kind, onclick: () => { if (chooser) { const f = chooser.files; hideChooser(); sendFiles(f, kind); } } },
    h('div', { class: 'gx-ico' }, icon(ic)), h('b', null, title), h('small', null, sub));
  ui.tileDoc = tile('document', 'doc', 'Send as Document', 'Original file, full quality. No compression.');
  ui.tileMedia = tile('media', 'image', 'Send as Photo / Video', 'WhatsApp compresses it and shows a preview.');
  ui.files = h('div', { class: 'gx-files' });
  ui.dropHint = h('div', { class: 'gx-hint' });
  ui.drop = h('div', { id: 'gx-drop', onclick: e => { if (e.target === ui.drop) hideChooser(); } }, h('div', { class: 'gx-tiles' }, ui.tileDoc, ui.tileMedia), ui.files, ui.dropHint);

  ui.pendingLabel = h('span');
  ui.pending = h('div', { id: 'gx-pending', class: 'gx-panel' }, icon('paperclip'), ui.pendingLabel,
    h('button', { class: 'gx-act small primary', onclick: () => sendFiles(pending, 'document') }, 'Send as document'),
    h('button', { class: 'gx-act small', onclick: () => sendFiles(pending, 'media') }, 'Photo/Video'),
    h('button', { class: 'gx-btn', 'aria-label': 'Discard', onclick: clearPending }, icon('x')));

  ui.lockInput = h('input', { type: 'password', inputmode: 'numeric', maxlength: '12', placeholder: '••••', autocomplete: 'off',
    onkeydown: e => { if (e.key === 'Enter') tryUnlock(); } });
  ui.lockErr = h('div', { class: 'err' });
  ui.lockBox = h('div', { class: 'gx-lockbox gx-panel' }, h('i', { class: 'gx-logo' }), h('h3', null, 'Glasschat is locked'), h('p', null, 'Enter your PIN to continue'),
    ui.lockInput, ui.lockErr, h('button', { class: 'gx-act primary', style: { width: '100%', justifyContent: 'center' }, onclick: tryUnlock }, icon('lock'), 'Unlock'));
  ui.lock = h('div', { id: 'gx-lock' }, ui.lockBox);

  const fb = (label, mark, tip) => h('button', { class: 'gx-btn', 'data-tip': tip, onmousedown: e => { e.preventDefault(); wrapSelection(mark); } }, label);
  ui.fmt = h('div', { id: 'gx-fmt', class: 'gx-panel' }, fb('B', '*', 'Bold  Ctrl+B'), fb('I', '_', 'Italic  Ctrl+I'), fb('S', '~', 'Strike  Ctrl+Shift+X'), fb('</>', '```', 'Monospace  Ctrl+Shift+K'), fb('❝', '> ', 'Quote'));
  ui.fmt.children[1].style.fontStyle = 'italic'; ui.fmt.children[2].style.textDecoration = 'line-through';
  ui.fmt.lastChild.onmousedown = e => { e.preventDefault(); const sel = window.getSelection(); const t = sel.toString(); document.execCommand('insertText', false, t.split('\n').map(l => '> ' + l).join('\n')); };

  ui.toasts = h('div', { id: 'gx-toasts' });
  ui.root = h('div', { id: 'gx-root' }, bar, ui.scrim, ui.drawer, ui.palette, ui.snips, ui.notes, ui.sched, ui.pending, ui.fmt, ui.drop, ui.toasts, ui.lock);
  document.documentElement.append(ui.root);
  setupDrop();
  setupPaste();
  setupFormatBar();
}

function refreshBar() {
  if (!ui.root) return;
  const dropTip = { ask: 'Drag & drop: ask each time', document: 'Drag & drop: always Document', media: 'Drag & drop: always Photo/Video', default: 'Drag & drop: WhatsApp default' }[S.dropMode];
  ui.tDrop.setAttribute('data-tip', dropTip + ' (click to change)');
  ui.tDrop.classList.toggle('on', S.dropMode === 'document');
  ui.tPrivacy.classList.toggle('on', !!S.privacyBlur);
  ui.tFocus.classList.toggle('on', !!S.focusMode);
  ui.tTop.classList.toggle('on', !!S.alwaysOnTop);
  ui.tDnd.classList.toggle('on', !!dndOn);
  setKids(ui.tDnd, icon(dndOn ? 'belloff' : 'bell'));
  ui.tDnd.setAttribute('data-tip', dndOn ? (S.dnd ? 'Do not disturb is on' : 'Quiet hours active') : 'Do not disturb');
  ui.tLock.classList.toggle('on', !!S.hasPin);
  if (ui.drawer.classList.contains('on')) renderTab();
  if (ui.snips.classList.contains('on')) renderSnips();
  if (ui.sched.classList.contains('on')) renderSched();
}
function cycleDrop() {
  const order = ['ask', 'document', 'media', 'default'];
  const next = order[(order.indexOf(S.dropMode) + 1) % order.length];
  set({ dropMode: next });
  toast({ ask: 'Drag & drop: ask each time', document: 'Drag & drop: always send as Document', media: 'Drag & drop: always Photo/Video', default: 'Drag & drop: WhatsApp default' }[next], { icon: 'doc' });
}
function nextTheme() {
  const keys = Object.keys(PRESETS);
  const k = keys[(keys.indexOf(S.theme) + 1) % keys.length];
  set({ theme: k, accent: '' });
  toast('Theme: ' + PRESETS[k].name, { icon: 'palette', ms: 1800 });
}

// ------------------------------------------------------------------ drag & drop
let dragDepth = 0;
function hasFiles(e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'); }
function setupDrop() {
  window.addEventListener('dragenter', e => {
    if (S.dropMode === 'default' || !hasFiles(e) || locked) return;
    e.preventDefault(); e.stopPropagation();
    dragDepth++; if (dragDepth === 1) { chooser = null; showChooser(null); }
  }, true);
  window.addEventListener('dragleave', e => {
    if (S.dropMode === 'default' || !hasFiles(e)) return;
    e.stopPropagation();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideChooser();
  }, true);
  window.addEventListener('dragover', e => {
    if (S.dropMode === 'default' || !hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    const tile = e.target.closest && e.target.closest('.gx-tile');
    ui.tileDoc.classList.toggle('hot', tile === ui.tileDoc);
    ui.tileMedia.classList.toggle('hot', tile === ui.tileMedia);
  }, true);
  window.addEventListener('drop', e => {
    if (S.dropMode === 'default' || !hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    dragDepth = 0;
    const tile = e.target.closest && e.target.closest('.gx-tile');
    const kind = tile ? tile.dataset.kind : (S.dropMode === 'ask' ? null : S.dropMode);
    const files = Array.from(e.dataTransfer.files);
    hideChooser();
    if (kind) sendFiles(files, kind);
  }, true);
}
function setupPaste() {
  window.addEventListener('paste', e => {
    if (S.pasteMode === 'default' || locked) return;
    const box = composeBox();
    if (!box || !box.contains(e.target)) return;
    const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
    if (!files.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const named = files.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `Pasted ${new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19)}${i ? '-' + (i + 1) : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
    offerFiles(named, S.pasteMode);
  }, true);
}
function setupFormatBar() {
  document.addEventListener('selectionchange', () => {
    if (!S.formatting) { ui.fmt.classList.remove('on'); return; }
    const box = composeBox(); const sel = window.getSelection();
    if (!box || !sel.rangeCount || sel.isCollapsed || !box.contains(sel.anchorNode)) { ui.fmt.classList.remove('on'); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const zoom = 1;
    ui.fmt.style.left = Math.max(8, r.left * zoom + r.width / 2 - 95) + 'px';
    ui.fmt.style.top = Math.max(50, r.top * zoom - 48) + 'px';
    ui.fmt.classList.add('on');
  });
}

// ------------------------------------------------------------------ floating panels
function togglePanel(name) {
  const map = { snips: ui.snips, notes: ui.notes, sched: ui.sched };
  const current = Object.keys(map).find(k => map[k].classList.contains('on'));
  for (const el of Object.values(map)) el.classList.remove('on');
  if (!name || current === name) return;
  if (name === 'notes' || name === 'sched') {
    if (!chatOpen()) { toast('Open a chat first.', { error: true }); return; }
  }
  if (name === 'snips') renderSnips();
  if (name === 'notes') { const t = chatTitle(); ui.notesTitle.textContent = 'Notes · ' + t; ui.notesText.dataset.chat = t; ui.notesText.value = (S.notes || {})[t] || ''; setTimeout(() => ui.notesText.focus(), 50); }
  if (name === 'sched') renderSched();
  map[name].classList.add('on');
}
function renderSnips() {
  setKids(ui.snipList, ...(S.snippets || []).map((s, i) =>
    h('button', { class: 'gx-item', onclick: () => { if (insertText(s.text)) togglePanel(null); } },
      h('b', null, `${i < 9 ? 'Alt+' + (i + 1) + ' · ' : ''}${s.name}`), h('small', null, s.text))),
    (S.snippets || []).length ? null : h('p', { class: 'gx-note' }, 'No quick replies yet. Add some in Settings › Sending.'));
}
function renderSched() {
  const chat = chatTitle();
  const pad2 = n => String(n).padStart(2, '0');
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const local = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const text = h('textarea', { class: 'gx-input', rows: '3', placeholder: 'Message' });
  const when = h('input', { class: 'gx-input', type: 'datetime-local', value: local });
  const list = (S.scheduled || []).slice().sort((a, b) => a.at - b.at);
  setKids(ui.schedBody, 
    h('div', { class: 'gx-field' }, h('label', null, 'To'), h('input', { class: 'gx-input', value: chat, disabled: true })),
    h('div', { class: 'gx-field' }, h('label', null, 'Message'), text),
    h('div', { class: 'gx-field' }, h('label', null, 'Send at'), when),
    h('button', { class: 'gx-act primary', style: { width: '100%', justifyContent: 'center' }, onclick: () => {
      const at = new Date(when.value).getTime();
      if (!text.value.trim()) return toast('Write a message first.', { error: true });
      if (!(at > Date.now())) return toast('Pick a time in the future.', { error: true });
      set({ scheduled: [...(S.scheduled || []), { id: Date.now().toString(36), chat, text: text.value, at }] });
      toast(`Scheduled for ${new Date(at).toLocaleString()}`, { icon: 'clock' });
    } }, icon('clock'), 'Schedule'),
    h('p', { class: 'gx-note' }, 'Glasschat must be running (it can sit in the tray) at the scheduled time.'),
    list.length ? h('div', { class: 'gx-sec' }, 'Upcoming') : null,
    list.map(it => h('div', { class: 'gx-sched-item' },
      h('div', null, h('b', null, `${it.failed ? '⚠ ' : ''}${it.chat} · ${new Date(it.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`), h('small', null, it.text)),
      it.failed ? h('button', { class: 'gx-btn', 'data-tip': 'Retry now', onclick: () => runScheduled(it, true) }, icon('refresh')) : null,
      h('button', { class: 'gx-btn', 'aria-label': 'Delete', onclick: () => set({ scheduled: S.scheduled.filter(x => x.id !== it.id) }) }, icon('trash')))));
}
let schedBusy = false;
async function runScheduled(it, manual) {
  if (schedBusy || locked) return;
  schedBusy = true;
  try {
    const ok = await sendTextTo(it.chat, it.text);
    if (ok) {
      await set({ scheduled: (S.scheduled || []).filter(x => x.id !== it.id) });
      toast(`Scheduled message sent to ${it.chat}`, { icon: 'send' });
    } else {
      await set({ scheduled: (S.scheduled || []).map(x => x.id === it.id ? { ...x, failed: true } : x) });
      ipcRenderer.invoke('gx:notify', { title: 'Scheduled message not sent', body: `Could not open the chat "${it.chat}". Open Glasschat to retry.` });
    }
  } catch (e) { logErr('schedule', e); }
  finally { schedBusy = false; }
}
setInterval(() => {
  const due = (S.scheduled || []).find(it => !it.failed && it.at <= Date.now());
  if (due && document.getElementById('side')) runScheduled(due);
}, 15000);

// ------------------------------------------------------------------ lock
function setLocked(on) {
  locked = on;
  document.documentElement.classList.toggle('gx-locked', on);
  ui.lock.classList.toggle('on', on);
  pushBridgeState();
  if (on) { togglePanel(null); toggleDrawer(false); closePalette(); hideChooser(); ui.lockInput.value = ''; ui.lockErr.textContent = ''; setTimeout(() => ui.lockInput.focus(), 60); }
}
async function tryUnlock() {
  const r = await ipcRenderer.invoke('gx:unlock', ui.lockInput.value);
  if (r.ok) return;
  ui.lockInput.value = '';
  ui.lockErr.textContent = r.wait ? `Too many tries. Wait ${r.wait}s.` : 'Wrong PIN';
  ui.lockBox.classList.remove('shake'); void ui.lockBox.offsetWidth; ui.lockBox.classList.add('shake');
}

// ------------------------------------------------------------------ command palette
let palSel = 0, palItems = [];
function commands() {
  const t = on => on ? 'On' : 'Off';
  const list = [
    { label: 'Send files as documents (original quality)', hint: 'Ctrl+Shift+D', icon: 'paperclip', run: () => ipcRenderer.invoke('gx:pick-send', 'document') },
    { label: 'Send photos / videos', icon: 'image', run: () => ipcRenderer.invoke('gx:pick-send', 'media') },
    { label: 'Paste clipboard image as document', hint: 'Ctrl+Shift+V', icon: 'clip', run: pasteAsDocument },
    { label: 'Snip & send a screenshot', hint: 'Ctrl+Shift+S', icon: 'scissors', run: () => ipcRenderer.invoke('gx:snip') },
    { label: 'Quick replies', hint: 'Ctrl+Shift+Q', icon: 'zap', run: () => togglePanel('snips') },
    { label: 'Private notes for this chat', hint: 'Ctrl+Shift+N', icon: 'note', run: () => togglePanel('notes') },
    { label: 'Schedule a message', icon: 'clock', run: () => togglePanel('sched') },
    { label: `Do not disturb: ${t(S.dnd)}`, icon: 'belloff', run: () => set({ dnd: !S.dnd }) },
    { label: S.hasPin ? 'Lock Glasschat now' : 'Set up app lock (PIN)', hint: 'Ctrl+L', icon: 'lock', run: () => S.hasPin ? ipcRenderer.invoke('gx:lock-now') : openDrawer('privacy') },
    { label: `Privacy blur: ${t(S.privacyBlur)}`, hint: 'Ctrl+Shift+P', icon: 'eyeoff', run: () => set({ privacyBlur: !S.privacyBlur }) },
    { label: `Focus mode: ${t(S.focusMode)}`, hint: 'Ctrl+Shift+F', icon: 'focus', run: () => set({ focusMode: !S.focusMode }) },
    { label: `Wide chat: ${t(S.wideChat)}`, icon: 'wide', run: () => set({ wideChat: !S.wideChat }) },
    { label: `Compact bubbles: ${t(S.compact)}`, icon: 'sliders', run: () => set({ compact: !S.compact }) },
    { label: `Glass effect: ${t(S.glass)}`, icon: 'palette', run: () => set({ glass: !S.glass }) },
    { label: `Always on top: ${t(S.alwaysOnTop)}`, hint: 'Ctrl+Shift+T', icon: 'pin', run: () => win('top') },
    { label: 'Mini mode (small floating window)', hint: 'Ctrl+Shift+M', icon: 'mini', run: () => win('mini') },
    { label: 'Drag & drop: ask each time', icon: 'doc', run: () => set({ dropMode: 'ask' }) },
    { label: 'Drag & drop: always Document', icon: 'doc', run: () => set({ dropMode: 'document' }) },
    { label: 'Drag & drop: always Photo/Video', icon: 'image', run: () => set({ dropMode: 'media' }) },
    { label: 'Drag & drop: WhatsApp default', icon: 'upload', run: () => set({ dropMode: 'default' }) },
    { label: 'Choose chat wallpaper…', icon: 'image', run: chooseWallpaper },
    { label: 'Open downloads folder', icon: 'folder', run: () => ipcRenderer.invoke('gx:open', 'downloads') },
    { label: 'Open extensions folder', icon: 'folder', run: () => ipcRenderer.invoke('gx:open', 'extensions') },
    { label: 'Settings', hint: 'Ctrl+,', icon: 'sliders', run: () => openDrawer() },
    { label: 'Zoom in', hint: 'Ctrl+=', icon: 'plus', run: () => win('zoom-in') },
    { label: 'Zoom out', hint: 'Ctrl+-', icon: 'minus', run: () => win('zoom-out') },
    { label: 'Reset zoom', hint: 'Ctrl+0', icon: 'refresh', run: () => win('zoom-reset') },
    { label: 'Reload WhatsApp', hint: 'Ctrl+R', icon: 'refresh', run: () => win('reload') },
    { label: 'Clear cache and reload', icon: 'refresh', run: () => win('hard-reload') },
    { label: 'Developer tools', hint: 'Ctrl+Shift+I', icon: 'code', run: () => win('devtools') },
    { label: 'Quit Glasschat', icon: 'x', run: () => win('quit') }
  ];
  for (const [k, p] of Object.entries(PRESETS)) list.push({ label: `Theme: ${p.name}`, icon: 'palette', hint: S.theme === k ? 'current' : '', run: () => set({ theme: k, accent: '' }) });
  for (const [k, f] of Object.entries(FONTS)) list.push({ label: `Font: ${f.label}`, icon: 'type', hint: S.font === k ? 'current' : f.note, run: () => set({ font: k }) });
  (S.snippets || []).forEach(s => list.push({ label: `Insert: ${s.name}`, hint: s.text.slice(0, 40), icon: 'zap', run: () => insertText(s.text) }));
  return list;
}
function openPalette() {
  if (locked) return;
  toggleDrawer(false); togglePanel(null);
  ui.palette.classList.add('on'); ui.palInput.value = ''; palSel = 0; renderPalette();
  setTimeout(() => ui.palInput.focus(), 20);
}
function closePalette() { ui.palette.classList.remove('on'); }
function renderPalette() {
  const words = ui.palInput.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  palItems = commands().filter(c => words.every(w => (c.label + ' ' + (c.hint || '')).toLowerCase().includes(w)));
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  setKids(ui.palList, ...palItems.map((c, i) => h('li', {
    class: i === palSel ? 'sel' : '', onmousemove: () => { if (palSel !== i) { palSel = i; $$('li', ui.palList).forEach((li, j) => li.classList.toggle('sel', j === i)); } }, onclick: () => runPal(i)
  }, icon(c.icon), h('span', null, c.label), c.hint ? h('small', null, c.hint) : null)),
  palItems.length ? null : h('li', null, icon('search'), h('span', null, 'No matching action')));
}
function runPal(i) { const c = palItems[i]; closePalette(); if (c) setTimeout(() => c.run(), 10); }
function paletteKeys(e) {
  if (e.key === 'ArrowDown') { palSel = Math.min(palItems.length - 1, palSel + 1); renderPalette(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { palSel = Math.max(0, palSel - 1); renderPalette(); e.preventDefault(); }
  else if (e.key === 'Enter') { runPal(palSel); e.preventDefault(); }
  else if (e.key === 'Escape') { closePalette(); e.preventDefault(); }
  const li = ui.palList.children[palSel]; if (li) li.scrollIntoView({ block: 'nearest' });
}

// ------------------------------------------------------------------ settings drawer
let tab = 'look';
const TABS = [['look', 'Look'], ['sending', 'Sending'], ['privacy', 'Privacy'], ['extensions', 'Extensions'], ['window', 'Window'], ['keys', 'Shortcuts'], ['about', 'About']];
function toggleDrawer(force) {
  const on = force ?? !ui.drawer.classList.contains('on');
  if (on && locked) return;
  ui.drawer.classList.toggle('on', on); ui.scrim.classList.toggle('on', on);
  if (on) { closePalette(); togglePanel(null); renderTab(); }
}
function openDrawer(t) { if (t) tab = t; toggleDrawer(true); }

const sec = t => h('div', { class: 'gx-sec' }, t);
const row = (label, sub, ...ctrl) => h('div', { class: 'gx-row' }, h('div', { class: 'gx-lbl' }, h('b', null, label), sub ? h('small', null, sub) : null), ...ctrl);
const sw = key => h('button', { class: 'gx-sw' + (S[key] ? ' on' : ''), role: 'switch', 'aria-checked': String(!!S[key]), onclick: () => set({ [key]: !S[key] }) });
function rangeRow(label, sub, key, min, max, step, fmt) {
  const val = h('span', { class: 'gx-val' }, fmt(S[key]));
  let tmr;
  const pct = v => ((v - min) / (max - min) * 100) + '%';
  const input = h('input', { type: 'range', class: 'gx-range', min, max, step, value: S[key], 'aria-label': label, style: { '--p': pct(S[key]) },
    oninput: e => { const v = parseFloat(e.target.value); e.target.style.setProperty('--p', pct(v)); val.textContent = fmt(v); S[key] = v; applyTheme(); clearTimeout(tmr); tmr = setTimeout(() => set({ [key]: v }), 220); } });
  return row(label, sub, input, val);
}
const seg = (key, options) => h('div', { class: 'gx-seg' }, options.map(([v, l]) => h('button', { class: S[key] === v ? 'on' : '', onclick: () => set({ [key]: v }) }, l)));
async function chooseWallpaper() {
  const r = await ipcRenderer.invoke('gx:pick-wallpaper');
  if (!r) return;
  if (r.error) return toast(r.error, { error: true });
  await set({ wallpaper: r.name });
  toast('Wallpaper set.', { icon: 'image' });
}

function renderTab() {
  setKids(ui.tabs, ...TABS.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; ui.body.scrollTop = 0; renderTab(); } }, l)));
  const keepScroll = ui.body.scrollTop;
  const B = [];
  if (tab === 'look') {
    B.push(sec('Theme'), h('div', { class: 'gx-themes' }, Object.entries(PRESETS).map(([k, p]) =>
      h('button', { class: 'gx-theme' + (S.theme === k ? ' on' : ''), onclick: () => set({ theme: k, accent: '' }) }, h('i', { style: { background: p.sw } }), h('span', null, p.name)))));
    B.push(row('Accent color', S.accent ? 'Custom' : 'Follows the theme',
      h('input', { type: 'color', class: 'gx-color', value: S.accent || (PRESETS[S.theme] || PRESETS.aurora).accent, onchange: e => set({ accent: e.target.value }) }),
      S.accent ? h('button', { class: 'gx-act small', onclick: () => set({ accent: '' }) }, 'Reset') : null));
    B.push(sec('Font'), h('div', { class: 'gx-fonts' }, Object.entries(FONTS).map(([k, f]) =>
      h('button', { class: 'gx-fontcard' + (S.font === k ? ' on' : ''), onclick: () => set({ font: k }) },
        h('b', { style: { fontFamily: f.stack || 'Roboto, "Segoe UI", sans-serif' } }, 'Aa Glass'), h('small', null, `${f.label} · ${f.note}`)))));
    B.push(rangeRow('Message text size', '0 = WhatsApp default', 'msgSize', 0, 22, 0.5, v => v ? v + 'px' : 'auto'));
    B.push(sec('Glass'));
    B.push(row('Glass effect', 'See-through panels over the window backdrop', sw('glass')));
    B.push(row('Window material', 'Windows 11 backdrop', seg('material', [['acrylic', 'Acrylic'], ['mica', 'Mica'], ['tabbed', 'Tabbed'], ['none', 'Solid']])));
    B.push(rangeRow('Panel opacity', 'Lower = more see-through', 'panelOpacity', 0.1, 0.95, 0.01, v => Math.round(v * 100) + '%'));
    B.push(rangeRow('Blur', 'Frosting behind panels', 'blur', 0, 40, 1, v => v + 'px'));
    B.push(rangeRow('Corner radius', 'Bubbles, message box and panels', 'radius', 0, 26, 1, v => v + 'px'));
    B.push(sec('Chat'));
    B.push(row('Wallpaper', S.wallpaper ? 'Custom image' : 'None',
      h('button', { class: 'gx-act small', onclick: chooseWallpaper }, icon('image'), 'Choose'),
      S.wallpaper ? h('button', { class: 'gx-act small', onclick: () => set({ wallpaper: '' }) }, 'Clear') : null));
    B.push(rangeRow('Wallpaper dim', 'Keeps messages readable', 'wallpaperDim', 0, 0.9, 0.01, v => Math.round(v * 100) + '%'));
    B.push(rangeRow('Doodle pattern', 'WhatsApp\'s background pattern', 'doodle', 0, 1, 0.01, v => Math.round(v * 100) + '%'));
    B.push(row('Incoming bubble', S.bubbleIn ? 'Custom' : 'Auto from theme',
      h('input', { type: 'color', class: 'gx-color', value: S.bubbleIn || '#2a3340', onchange: e => set({ bubbleIn: e.target.value }) }),
      S.bubbleIn ? h('button', { class: 'gx-act small', onclick: () => set({ bubbleIn: '' }) }, 'Auto') : null));
    B.push(row('Outgoing bubble', S.bubbleOut ? 'Custom' : 'Auto from accent',
      h('input', { type: 'color', class: 'gx-color', value: S.bubbleOut || '#1d5c4a', onchange: e => set({ bubbleOut: e.target.value }) }),
      S.bubbleOut ? h('button', { class: 'gx-act small', onclick: () => set({ bubbleOut: '' }) }, 'Auto') : null));
    B.push(row('Reset look', 'Back to defaults (keeps replies, notes, PIN)', h('button', { class: 'gx-act small', onclick: () => ipcRenderer.invoke('gx:reset') }, 'Reset')));
  }
  if (tab === 'sending') {
    B.push(sec('Send files'), h('div', { class: 'gx-acts' },
      h('button', { class: 'gx-act primary', onclick: () => { toggleDrawer(false); ipcRenderer.invoke('gx:pick-send', 'document'); } }, icon('paperclip'), 'Send files as documents'),
      h('button', { class: 'gx-act', onclick: () => { toggleDrawer(false); ipcRenderer.invoke('gx:snip'); } }, icon('scissors'), 'Snip & send'),
      h('button', { class: 'gx-act', onclick: () => { toggleDrawer(false); pasteAsDocument(); } }, icon('clip'), 'Paste as document')));
    B.push(row('Drag & drop files', null)); B.push(h('div', { style: { margin: '-2px 0 10px' } }, seg('dropMode', [['ask', 'Ask'], ['document', 'Always document'], ['media', 'Always photo/video'], ['default', 'WhatsApp default']])));
    B.push(row('Paste images into the message box', null)); B.push(h('div', { style: { margin: '-2px 0 10px' } }, seg('pasteMode', [['ask', 'Ask'], ['document', 'Always document'], ['default', 'WhatsApp default']])));
    B.push(row('Snip & send screenshots', null)); B.push(h('div', { style: { margin: '-2px 0 10px' } }, seg('snipMode', [['ask', 'Ask'], ['document', 'Document'], ['media', 'Photo']])));
    B.push(row('Send automatically', 'Press send for you after files are attached', sw('autoSend')));
    B.push(row('"Send to › Glasschat" in Explorer', 'Right-click files › Send to › Glasschat', sw('sendToMenu')));
    B.push(row('Formatting bar', 'Bold / italic / strike / mono when you select text', sw('formatting')));
    B.push(sec('Quick replies'));
    const snips = (S.snippets || []).map(s => ({ ...s }));
    let tmr;
    const save = () => { clearTimeout(tmr); tmr = setTimeout(() => set({ snippets: snips }), 400); };
    snips.forEach((s, i) => B.push(h('div', { class: 'gx-snip' },
      h('div', { class: 'gx-snip-top' },
        h('input', { class: 'gx-input', value: s.name, placeholder: 'Name', oninput: e => { s.name = e.target.value; save(); } }),
        h('button', { class: 'gx-btn', 'aria-label': 'Delete', onclick: () => { snips.splice(i, 1); set({ snippets: snips }); } }, icon('trash'))),
      h('textarea', { class: 'gx-textarea', value: s.text, placeholder: 'Message text', oninput: e => { s.text = e.target.value; save(); } }))));
    B.push(h('button', { class: 'gx-act', onclick: () => set({ snippets: [...snips, { name: 'New reply', text: '' }] }) }, icon('plus'), 'Add quick reply'));
    B.push(h('p', { class: 'gx-note' }, 'Use them from ⚡, Ctrl+Shift+Q, Alt+1…9, or Ctrl+K and type "insert".'));
  }
  if (tab === 'privacy') {
    B.push(sec('App lock'));
    const pin = h('input', { class: 'gx-input', type: 'password', inputmode: 'numeric', placeholder: S.hasPin ? 'New PIN (4–12 digits)' : 'PIN (4–12 digits)', style: { width: '170px' } });
    B.push(row(S.hasPin ? 'PIN is set' : 'Set a PIN', 'Locks Glasschat with a blurred screen', pin,
      h('button', { class: 'gx-act small primary', onclick: async () => { const ok = await ipcRenderer.invoke('gx:set-pin', pin.value.trim()); toast(ok ? 'PIN saved. App lock is on.' : 'Use 4–12 digits.', { error: !ok, icon: 'lock' }); } }, 'Save')));
    if (S.hasPin) {
      B.push(row('App lock', null, sw('lockEnabled')));
      B.push(row('Lock after idle', S.lockAfter ? `${S.lockAfter} minutes without using the PC` : 'Only when Glasschat starts',
        seg('lockAfter', [[0, 'Off'], [5, '5m'], [10, '10m'], [30, '30m'], [60, '1h']])));
      B.push(row('Lock when minimized or hidden', null, sw('lockOnMinimize')));
      B.push(h('div', { class: 'gx-acts' },
        h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:lock-now') }, icon('lock'), 'Lock now'),
        h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:set-pin', '').then(() => toast('PIN removed.', { icon: 'lock' })) }, 'Remove PIN')));
    }
    B.push(sec('Notifications'));
    B.push(row('Do not disturb', 'No pop-ups and no taskbar flashing', sw('dnd')));
    const tFrom = h('input', { class: 'gx-input', type: 'time', value: S.quietFrom, style: { width: '110px' }, onchange: e => set({ quietFrom: e.target.value }) });
    const tTo = h('input', { class: 'gx-input', type: 'time', value: S.quietTo, style: { width: '110px' }, onchange: e => set({ quietTo: e.target.value }) });
    B.push(row('Quiet hours', 'Do not disturb every day', sw('quietHours')));
    if (S.quietHours) B.push(h('div', { class: 'gx-row' }, h('div', { class: 'gx-lbl' }, h('b', null, 'From')), tFrom, h('b', null, 'to'), tTo));
    B.push(row('Also mute sounds', 'While do not disturb is active', sw('dndMute')));
    B.push(row('Hide message text in pop-ups', 'Shows "New message" instead', sw('hideNotifText')));
    B.push(sec('On screen'));
    B.push(row('Privacy blur', 'Blur chats and messages until you hover', sw('privacyBlur')));
    B.push(row('Hide profile pictures', null, sw('hideAvatars')));
    B.push(row('Hide message previews', 'In the chat list', sw('hidePreviews')));
  }
  if (tab === 'extensions') {
    B.push(sec('Built-in'));
    B.push(row('Focus mode', 'Hide the chat list', sw('focusMode')));
    B.push(row('Wide chat', 'Messages use more of the width', sw('wideChat')));
    B.push(row('Compact bubbles', 'Tighter message padding', sw('compact')));
    B.push(row('Squircle avatars', 'Rounded-square profile pictures', sw('squircle')));
    B.push(row('Message animations', 'Soft slide-in for messages', sw('animations')));
    B.push(row('Formatting bar', 'Appears when you select text in the message box', sw('formatting')));
    B.push(sec('Your extensions'));
    const extBox = h('div', null, h('p', { class: 'gx-note' }, 'Loading…'));
    B.push(extBox);
    ipcRenderer.invoke('gx:list-extensions').then(list => {
      setKids(extBox, ...(list.length ? list.map(x => row(x.file, x.type === 'css' ? 'Style' : 'Script',
        h('button', { class: 'gx-sw' + (x.enabled ? ' on' : ''), role: 'switch', onclick: () => set({ extensions: { ...S.extensions, [x.file]: !x.enabled } }) })))
        : [h('p', { class: 'gx-note' }, 'No extensions found.')]));
    });
    B.push(h('div', { class: 'gx-acts' },
      h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:open', 'extensions') }, icon('folder'), 'Open folder'),
      h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:reload-extensions').then(() => { renderTab(); toast('Extensions reloaded.'); }) }, icon('refresh'), 'Reload')));
    B.push(sec('Custom CSS'));
    let ctmr;
    B.push(h('textarea', { class: 'gx-textarea', spellcheck: 'false', placeholder: '/* Your CSS, applied live */\n#main [data-testid="msg-container"] { font-size: 15px; }',
      value: S.customCSS || '', oninput: e => { clearTimeout(ctmr); const v = e.target.value; ctmr = setTimeout(() => set({ customCSS: v }), 500); } }));
  }
  if (tab === 'window') {
    B.push(sec('Window'));
    B.push(row('Always on top', null, h('button', { class: 'gx-sw' + (S.alwaysOnTop ? ' on' : ''), role: 'switch', onclick: () => win('top') })));
    B.push(row('Close to tray', 'Keep running for notifications and scheduled messages', sw('closeToTray')));
    B.push(row('Start with Windows', 'Starts hidden in the tray', sw('startWithWindows')));
    B.push(row('Start minimized', null, sw('startMinimized')));
    let ktmr;
    B.push(row('Show/hide hotkey', 'Works from any app', h('input', { class: 'gx-input', style: { width: '190px' }, value: S.hotkey || '',
      oninput: e => { clearTimeout(ktmr); const v = e.target.value; ktmr = setTimeout(() => set({ hotkey: v }), 700); } })));
    B.push(row('Zoom', Math.round((S.zoom || 1) * 100) + '%',
      h('button', { class: 'gx-act small', onclick: () => win('zoom-out') }, '−'),
      h('button', { class: 'gx-act small', onclick: () => win('zoom-reset') }, '100%'),
      h('button', { class: 'gx-act small', onclick: () => win('zoom-in') }, '+')));
    B.push(row('Spell check', null, sw('spellcheck')));
    B.push(sec('Downloads'));
    B.push(row('Save files to', S.downloadDir || 'Ask every time',
      h('button', { class: 'gx-act small', onclick: async () => { const d = await ipcRenderer.invoke('gx:pick-folder'); if (d) set({ downloadDir: d }); } }, icon('folder'), 'Choose'),
      S.downloadDir ? h('button', { class: 'gx-act small', onclick: () => set({ downloadDir: '' }) }, 'Ask') : null));
    B.push(h('div', { class: 'gx-acts' },
      h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:open', 'downloads') }, icon('folder'), 'Open downloads'),
      h('button', { class: 'gx-act', onclick: () => win('hard-reload') }, icon('refresh'), 'Clear cache & reload'),
      h('button', { class: 'gx-act', onclick: () => win('devtools') }, icon('code'), 'Developer tools')));
  }
  if (tab === 'keys') {
    const keys = [
      ['Command palette', 'Ctrl K'], ['Settings', 'Ctrl ,'], ['Send files as documents', 'Ctrl Shift D'], ['Paste image as document', 'Ctrl Shift V'],
      ['Snip & send screenshot', 'Ctrl Shift S'], ['Quick replies', 'Ctrl Shift Q'], ['Insert quick reply 1–9', 'Alt 1…9'], ['Chat notes', 'Ctrl Shift N'],
      ['Open chat 1–9', 'Ctrl 1…9'], ['Bold / italic (selected text)', 'Ctrl B / I'], ['Strike / monospace', 'Ctrl Shift X / K'],
      ['Lock now', 'Ctrl L'], ['Privacy blur', 'Ctrl Shift P'], ['Focus mode', 'Ctrl Shift F'], ['Always on top', 'Ctrl Shift T'], ['Mini mode', 'Ctrl Shift M'],
      ['Zoom in / out / reset', 'Ctrl = / - / 0'], ['Reload', 'Ctrl R'], ['Show / hide (global)', (S.hotkey || '').replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' ')]
    ];
    B.push(sec('Keyboard shortcuts'), h('table', { class: 'gx-keys' }, h('tbody', null, keys.map(([a, k]) => h('tr', null, h('td', null, a), h('td', null, k.split(' ').map(x => [h('kbd', null, x), ' '])))))));
  }
  if (tab === 'about') {
    B.push(sec('Glasschat ' + VERSION));
    B.push(h('p', { style: { color: 'var(--t-fg2)' } }, 'A glass-styled desktop client that runs WhatsApp Web, with one-click document sending, themes, fonts, quick replies, notes, scheduling, app lock and extensions.'));
    B.push(h('p', { class: 'gx-note' }, 'Unofficial. Not affiliated with or endorsed by WhatsApp or Meta. Your messages stay in WhatsApp Web; Glasschat only changes how the page looks and adds tools. Settings, notes and PIN are stored on this PC. Fonts: Inter, Plus Jakarta Sans, Figtree, Manrope, Outfit (SIL Open Font License).'));
    B.push(h('div', { class: 'gx-acts' }, h('button', { class: 'gx-act', onclick: () => ipcRenderer.invoke('gx:open', 'data') }, icon('folder'), 'Open app data folder')));
  }
  setKids(ui.body, ...B);
  ui.body.scrollTop = keepScroll;
}

// ------------------------------------------------------------------ keyboard
function onKey(e) {
  if (locked) { if (!e.target.closest || !e.target.closest('#gx-lock')) { e.preventDefault(); e.stopPropagation(); } return; }
  const c = e.ctrlKey || e.metaKey, s = e.shiftKey, k = e.key.toLowerCase();
  const go = fn => { e.preventDefault(); e.stopPropagation(); fn(); };
  if (e.key === 'Escape') {
    if (ui.palette.classList.contains('on')) return go(closePalette);
    if (ui.drawer.classList.contains('on')) return go(() => toggleDrawer(false));
    if (ui.drop.classList.contains('on')) return go(hideChooser);
    if ($('.gx-float.on')) return go(() => togglePanel(null));
    return;
  }
  const inCompose = composeBox() && composeBox().contains(e.target);
  if (inCompose && c && !s && k === 'b') return go(() => wrapSelection('*'));
  if (inCompose && c && !s && k === 'i') return go(() => wrapSelection('_'));
  if (inCompose && c && s && k === 'x') return go(() => wrapSelection('~'));
  if (inCompose && c && s && k === 'k') return go(() => wrapSelection('```'));
  if (c && !s && k === 'k') return go(openPalette);
  if (c && !s && e.key === ',') return go(() => toggleDrawer());
  if (c && !s && k === 'l') return go(() => S.hasPin ? ipcRenderer.invoke('gx:lock-now') : openDrawer('privacy'));
  if (c && s && k === 'd') return go(() => ipcRenderer.invoke('gx:pick-send', 'document'));
  if (c && s && k === 'v') return go(pasteAsDocument);
  if (c && s && k === 's') return go(() => ipcRenderer.invoke('gx:snip'));
  if (c && s && k === 'q') return go(() => togglePanel('snips'));
  if (c && s && k === 'n') return go(() => togglePanel('notes'));
  if (c && s && k === 'p') return go(() => set({ privacyBlur: !S.privacyBlur }));
  if (c && s && k === 'f') return go(() => set({ focusMode: !S.focusMode }));
  if (c && s && k === 't') return go(() => win('top'));
  if (c && s && k === 'm') return go(() => win('mini'));
  if (c && s && k === 'i') return go(() => win('devtools'));
  if (c && !s && (e.key === '=' || e.key === '+')) return go(() => win('zoom-in'));
  if (c && !s && e.key === '-') return go(() => win('zoom-out'));
  if (c && !s && e.key === '0') return go(() => win('zoom-reset'));
  if (c && !s && k === 'r') return go(() => win('reload'));
  if (c && !s && !e.altKey && /^[1-9]$/.test(e.key)) return go(() => jumpToChat(+e.key));
  if (e.altKey && !c && /^[1-9]$/.test(e.key)) { const sn = (S.snippets || [])[+e.key - 1]; if (sn) return go(() => insertText(sn.text)); }
}

// ------------------------------------------------------------------ live chat title in the bar
let lastTitle = null;
setInterval(() => {
  if (!ui.chat) return;
  const t = chatOpen() ? chatTitle() : '';
  if (t !== lastTitle) {
    lastTitle = t;
    ui.chat.textContent = S.privacyBlur ? '' : t;
    ui.tNotes.classList.toggle('on', !!(t && (S.notes || {})[t]));
    if (ui.notes.classList.contains('on')) togglePanel(null);
  }
}, 700);

// ------------------------------------------------------------------ boot
ipcRenderer.on('gx:settings', async (_e, s) => {
  const wallChanged = s.wallpaper !== S.wallpaper;
  S = s; lastTitle = null;
  if (wallChanged) await loadWallpaper();
  applyTheme();
});
ipcRenderer.on('gx:unread', (_e, n) => { if (ui.unread) { ui.unread.textContent = n > 99 ? '99+' : String(n); ui.unread.classList.toggle('on', n > 0); } });
ipcRenderer.on('gx:mini', (_e, on) => document.documentElement.classList.toggle('gx-mini', on));
ipcRenderer.on('gx:dnd', (_e, on) => { dndOn = on; pushBridgeState(); refreshBar(); });
ipcRenderer.on('gx:lock', (_e, on) => setLocked(on));
ipcRenderer.on('gx:downloaded', (_e, d) => toast('Saved ' + d.name, { icon: 'folder', ms: 6000, action: { label: 'Show', run: () => ipcRenderer.invoke('gx:show-item', d.path) } }));
ipcRenderer.on('gx:files', (_e, p) => {
  const files = p.files.map(f => new File([f.data], f.name, { type: f.type }));
  offerFiles(files, p.kind);
});
ipcRenderer.on('gx:command', (_e, cmd) => {
  if (cmd === 'settings') toggleDrawer();
  else if (cmd === 'palette') openPalette();
  else if (cmd === 'palette-off') closePalette();
  else if (cmd === 'paste-document') pasteAsDocument();
  else if (cmd === 'demo-drop') showChooser([new File(['x'.repeat(2400000)], 'Match poster final.psd', { type: 'image/vnd.adobe.photoshop' }), new File(['x'.repeat(800000)], 'Lineup.png', { type: 'image/png' })]);
  else if (cmd === 'demo-drop-off') hideChooser();
  else if (cmd === 'demo-lock') { ui.lock.classList.add('on'); document.documentElement.classList.add('gx-locked'); }
  else if (cmd === 'demo-lock-off') { ui.lock.classList.remove('on'); document.documentElement.classList.remove('gx-locked'); }
  else if (cmd.startsWith('panel:')) togglePanel(cmd === 'panel:off' ? null : cmd.slice(6));
  else if (cmd.startsWith('tab:')) { tab = cmd.slice(4); ui.body.scrollTop = 0; renderTab(); }
  else if (cmd.startsWith('fmt:')) wrapSelection(cmd.slice(4));
});

async function boot() {
  try {
    const r = await ipcRenderer.invoke('gx:get-settings');
    S = r.settings; VERSION = r.version; dndOn = r.dnd;
    await loadWallpaper();
    buildUI();
    applyTheme();
    if (r.unread) ipcRenderer.emit('gx:unread', null, r.unread);
    if (r.mini) document.documentElement.classList.add('gx-mini');
    if (r.locked) setLocked(true);
    window.addEventListener('keydown', onKey, true);
    let last = null;
    const check = () => { const d = detectDark(); if (d !== last) { last = d; applyTheme(); } };
    new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    setInterval(check, 3000);
    ipcRenderer.invoke('gx:ready');
  } catch (e) { logErr('boot', e); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
