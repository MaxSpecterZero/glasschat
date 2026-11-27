// Renders the Glasschat icon (glass squircle + chat bubble) to build/icon.png and build/icon.ico.
// Pure Node, no dependencies.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function render(size) {
  const SS = 4, N = size * SS;
  const out = Buffer.alloc(size * size * 4);
  const lerp = (a, b, t) => a + (b - a) * t;
  const c1 = [46, 230, 176], c2 = [106, 123, 255];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const u = ((x * SS + sx + .5) / N) * 2 - 1, v = ((y * SS + sy + .5) / N) * 2 - 1;
      // squircle background
      const sq = Math.pow(Math.abs(u / .94), 5) + Math.pow(Math.abs(v / .94), 5);
      if (sq > 1) continue;
      const t = Math.min(1, Math.max(0, (u + v + 2) / 4));
      let pr = lerp(c1[0], c2[0], t), pg = lerp(c1[1], c2[1], t), pb = lerp(c1[2], c2[2], t);
      // glossy top highlight
      const gl = Math.max(0, 1 - Math.hypot((u + .35) / 1.1, (v + .75) / .55));
      pr = lerp(pr, 255, gl * .35); pg = lerp(pg, 255, gl * .35); pb = lerp(pb, 255, gl * .35);
      // chat bubble (ellipse + tail)
      const bx = u - .0, by = v + .02;
      const inBubble = (bx * bx) / (.62 * .62) + (by * by) / (.5 * .5) <= 1;
      const tx = u + .38, ty = v - .5; // tail near bottom-left
      const inTail = ty <= .0 && ty >= -.3 && tx >= -.12 && tx <= .22 && (tx + .12) >= -(ty) * 0.4 && tx <= .22 + ty * .9;
      if (inBubble || inTail) {
        const wa = .93;
        pr = lerp(pr, 255, wa); pg = lerp(pg, 255, wa); pb = lerp(pb, 255, wa);
        // three dots
        for (const dx of [-.28, 0, .28]) {
          const d = Math.hypot(u - dx, v - .02);
          if (d < .085) { const tt = (dx + .28) / .56; pr = lerp(c1[0], c2[0], tt); pg = lerp(c1[1], c2[1], tt); pb = lerp(c1[2], c2[2], tt); }
        }
      }
      // inner rim
      if (sq > .9) { pr = lerp(pr, 255, .18); pg = lerp(pg, 255, .18); pb = lerp(pb, 255, .18); }
      r += pr; g += pg; b += pb; a += 255;
    }
    const n = SS * SS, i = (y * size + x) * 4;
    if (a) { out[i] = r / (a / 255); out[i + 1] = g / (a / 255); out[i + 2] = b / (a / 255); }
    out[i + 3] = a / n;
  }
  return out;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(size, rgba) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(images) {
  const head = Buffer.alloc(6); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const dirs = [], datas = [];
  for (const { size, data } of images) {
    const d = Buffer.alloc(16);
    d[0] = size >= 256 ? 0 : size; d[1] = size >= 256 ? 0 : size; d[2] = 0; d[3] = 0;
    d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6); d.writeUInt32LE(data.length, 8); d.writeUInt32LE(offset, 12);
    offset += data.length; dirs.push(d); datas.push(data);
  }
  return Buffer.concat([head, ...dirs, ...datas]);
}

const dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
const sizes = [16, 24, 32, 48, 64, 128, 256];
const imgs = sizes.map(s => ({ size: s, data: png(s, render(s)) }));
fs.writeFileSync(path.join(dir, 'icon.png'), png(512, render(512)));
fs.writeFileSync(path.join(dir, 'icon.ico'), ico(imgs));
console.log('icon written:', dir);
