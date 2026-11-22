// Renders the shield icon to PNGs without extra dependencies (anti-aliased by supersampling).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const BRAND = [15, 122, 69];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Shape in a 32x32 design space (same as the in-app SVG logo).
function inShield(x, y) {
  if (y < 2 || y > 30) return false;
  const top = 2 + (Math.abs(x - 16) / 12) * 4.5; // sloped top edge
  if (y < top) return false;
  if (y <= 14.7) return x >= 4 && x <= 28;
  // lower half tapers to a point at (16, 30)
  const t = (y - 14.7) / (30 - 14.7);
  const half = 12 * Math.sqrt(Math.max(0, 1 - t * t));
  return Math.abs(x - 16) <= half;
}
function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function inTick(x, y) {
  return distToSeg(x, y, 10.5, 16.2, 14.3, 20) < 1.7 || distToSeg(x, y, 14.3, 20, 21.7, 12) < 1.7;
}

mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const ss = 4, buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const X = ((x + (sx + 0.5) / ss) / size) * 32, Y = ((y + (sy + 0.5) / ss) / size) * 32;
      if (!inShield(X, Y)) continue;
      const c = inTick(X, Y) ? WHITE : BRAND;
      r += c[0]; g += c[1]; b += c[2]; a += 1;
    }
    const i = (y * size + x) * 4, n = ss * ss;
    if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; }
    buf[i + 3] = Math.round((a / n) * 255);
  }
  writeFileSync(`public/icons/${size}.png`, png(size, buf));
}
console.log('icons written');
