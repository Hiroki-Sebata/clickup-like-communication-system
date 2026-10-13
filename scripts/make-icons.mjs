// Generates the PWA icons as real PNG files, with no image libraries.
// A PNG is just a header plus zlib-compressed rows of pixels, so we can write one by hand.
// Run with: npm run icons
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// --- tiny PNG writer -------------------------------------------------------
function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // 8 bits per channel
  ihdr[9] = 6;   // colour type 6 = RGBA
  // rows are prefixed with a filter byte (0 = no filter)
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the icon artwork ------------------------------------------------------
// A rounded square with the app's blue/violet gradient and three white "kanban"
// columns of different heights, echoing the Board screen.
function draw(size, { maskable }) {
  const px = Buffer.alloc(size * size * 4);
  // "maskable" icons must keep their artwork inside a safe circle, so the shape
  // fills the whole square and the columns are drawn smaller.
  const pad = maskable ? 0 : Math.round(size * 0.06);
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const inner = size - pad * 2;

  const set = (x, y, r, g, b, a) => {
    const i = (y * size + x) * 4;
    // simple "source over" blend so the shapes have soft edges
    const sa = a / 255, da = px[i + 3] / 255, oa = sa + da * (1 - sa);
    if (oa === 0) return;
    px[i] = Math.round((r * sa + px[i] * da * (1 - sa)) / oa);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };

  // rounded-rectangle coverage, anti-aliased by sampling the corner distance
  const coverage = (x, y, left, top, w, h, r) => {
    const cx = Math.min(Math.max(x, left + r), left + w - r);
    const cy = Math.min(Math.max(y, top + r), top + h - r);
    const d = Math.hypot(x - cx, y - cy);
    if (x < left - 1 || y < top - 1 || x > left + w || y > top + h) return 0;
    return Math.min(1, Math.max(0, r + 0.5 - d));
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = radius > 0 ? coverage(x, y, pad, pad, inner, inner, radius) : 1;
      if (a <= 0) continue;
      // diagonal gradient: indigo -> violet
      const t = (x + y) / (2 * size);
      const r = Math.round(0x4f + (0x8b - 0x4f) * t);
      const g = Math.round(0x6f + (0x5c - 0x6f) * t);
      const b = Math.round(0xf5 + (0xf0 - 0xf5) * t);
      set(x, y, r, g, b, Math.round(a * 255));
    }
  }

  // three columns, like a tiny kanban board
  const colW = Math.round(inner * 0.14);
  const gap = Math.round(inner * 0.09);
  const totalW = colW * 3 + gap * 2;
  const startX = Math.round((size - totalW) / 2);
  const heights = [0.46, 0.62, 0.34];
  const maxH = Math.round(inner * 0.62);
  const bottom = Math.round(size / 2 + maxH / 2);
  const colR = Math.round(colW * 0.35);

  heights.forEach((frac, i) => {
    const h = Math.round(inner * frac);
    const left = startX + i * (colW + gap);
    const top = bottom - h;
    for (let y = top - 1; y <= top + h + 1; y++) {
      for (let x = left - 1; x <= left + colW + 1; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const a = coverage(x, y, left, top, colW, h, colR);
        if (a > 0) set(x, y, 255, 255, 255, Math.round(a * 235));
      }
    }
  });

  return png(size, size, px);
}

mkdirSync(new URL('../public/', import.meta.url), { recursive: true });
const out = (name, buf) => {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), buf);
  console.log(name, buf.length, 'bytes', createHash('sha1').update(buf).digest('hex').slice(0, 8));
};
out('icon-192.png', draw(192, { maskable: false }));
out('icon-512.png', draw(512, { maskable: false }));
out('icon-maskable-512.png', draw(512, { maskable: true }));
