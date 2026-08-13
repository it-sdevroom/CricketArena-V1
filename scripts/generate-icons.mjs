/**
 * Generate the app icon set.
 *
 *   node scripts/generate-icons.mjs
 *
 * Written as a tiny PNG encoder rather than pulling in an image library,
 * because the whole icon set is flat colour and simple geometry — a cricket
 * ball with its seam, in the app's own palette. Keeping it as code means the
 * icons regenerate from the theme instead of being binaries nobody can edit.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets');

// The palette from constants/theme.ts.
const BG = [6, 23, 19, 255]; // #061713
const CARD = [14, 40, 34, 255]; // #0E2822
const GREEN = [32, 215, 138, 255]; // #20D78A
const LIME = [184, 243, 74, 255]; // #B8F34A
const WHITE = [244, 255, 249, 255];
const CLEAR = [0, 0, 0, 0];

// --- PNG encoding ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA pixel data as a PNG buffer. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 means "none".
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing ---------------------------------------------------------------

class Canvas {
  constructor(size) {
    this.size = size;
    this.data = Buffer.alloc(size * size * 4);
  }

  set(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    if (a === 255) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255;
      return;
    }
    // Source-over alpha blend, so anti-aliased edges sit correctly on what is
    // already there.
    const sa = a / 255;
    const da = this.data[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    this.data[i] = Math.round((r * sa + this.data[i] * da * (1 - sa)) / oa);
    this.data[i + 1] = Math.round((g * sa + this.data[i + 1] * da * (1 - sa)) / oa);
    this.data[i + 2] = Math.round((b * sa + this.data[i + 2] * da * (1 - sa)) / oa);
    this.data[i + 3] = Math.round(oa * 255);
  }

  fill(colour) {
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) this.set(x, y, colour);
  }

  /** Rounded rectangle covering the whole canvas, used for the iOS-style tile. */
  roundedFill(colour, radius) {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const dx = Math.max(radius - x, x - (s - 1 - radius), 0);
        const dy = Math.max(radius - y, y - (s - 1 - radius), 0);
        const d = Math.hypot(dx, dy);
        const cov = Math.max(0, Math.min(1, radius - d + 0.5));
        if (cov > 0) this.set(x, y, [colour[0], colour[1], colour[2], Math.round(colour[3] * cov)]);
      }
    }
  }

  /** Anti-aliased disc. */
  disc(cx, cy, r, colour) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const cov = Math.max(0, Math.min(1, r - d + 0.5));
        if (cov > 0) this.set(x, y, [colour[0], colour[1], colour[2], Math.round(colour[3] * cov)]);
      }
    }
  }

  /** Anti-aliased ring segment, for the ball's seam. */
  seam(cx, cy, r, thickness, colour, squash) {
    const x0 = Math.floor(cx - r - 2), x1 = Math.ceil(cx + r + 2);
    const y0 = Math.floor(cy - r - 2), y1 = Math.ceil(cy + r + 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Squashing one axis turns the circle into the ellipse that reads as a
        // seam curving around a sphere.
        const d = Math.hypot((x - cx) / squash, y - cy);
        const cov = Math.max(0, Math.min(1, thickness / 2 - Math.abs(d - r) + 0.5));
        if (cov > 0) this.set(x, y, [colour[0], colour[1], colour[2], Math.round(colour[3] * cov)]);
      }
    }
  }

  /** Filled rectangle with rounded ends, for stumps. */
  bar(x, y, w, h, colour) {
    for (let yy = Math.floor(y); yy < y + h; yy++) {
      for (let xx = Math.floor(x); xx < x + w; xx++) this.set(xx, yy, colour);
    }
  }
}

/**
 * The mark: a cricket ball, seam toward the viewer, with the stumps standing
 * behind it. `scale` lets the same artwork sit inside Android's smaller safe
 * area without redrawing it.
 *
 * The composition is centred on the canvas as a whole, not on the ball, so the
 * icon still looks balanced once Android masks it to a circle.
 */
function drawMark(c, scale = 1) {
  const s = c.size;
  const cx = s / 2;
  // Sit the group slightly high so the ball's mass lands on the optical centre.
  const cy = s / 2 - s * 0.02 * scale;
  const r = s * 0.235 * scale;

  // --- stumps, behind and above the ball ---
  const stumpH = s * 0.34 * scale;
  const stumpW = Math.max(2, s * 0.026 * scale);
  const gap = s * 0.068 * scale;
  const top = cy - stumpH * 0.98;
  for (let i = -1; i <= 1; i++) {
    c.bar(cx + i * gap - stumpW / 2, top, stumpW, stumpH, [...LIME.slice(0, 3), 190]);
  }
  // Bails across the top.
  c.bar(
    cx - gap - stumpW,
    top - s * 0.02 * scale,
    gap * 2 + stumpW * 2,
    s * 0.015 * scale,
    [...LIME.slice(0, 3), 190],
  );

  // --- the ball ---
  const by = cy + s * 0.085 * scale;
  c.disc(cx, by, r, GREEN);

  // Volume via a soft radial falloff rather than a second hard-edged disc:
  // darken toward the lower right, fading smoothly to nothing.
  const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(by - r - 1), y1 = Math.ceil(by + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - by);
      if (d > r) continue;
      const edge = Math.max(0, Math.min(1, r - d)); // stay inside the rim
      // 0 at the top-left highlight, 1 at the bottom-right.
      const t = Math.max(0, Math.min(1, ((x - cx) + (y - by)) / (2 * r) + 0.5));
      const shade = Math.round(105 * t * t * edge);
      if (shade > 0) c.set(x, y, [8, 92, 63, shade]);
    }
  }

  // Seam: a narrow ellipse, as a real ball looks side-on.
  const squash = 0.2;
  c.seam(cx, by, r * 0.82, Math.max(2, s * 0.019 * scale), [...BG.slice(0, 3), 235], squash);

  // Stitching either side of the seam, the detail that makes it read as cricket
  // rather than as a generic ball.
  const stitches = 7;
  for (let i = 0; i < stitches; i++) {
    const a = -Math.PI / 2 + (Math.PI * (i + 0.5)) / stitches;
    const sy = by + Math.sin(a) * r * 0.82;
    // Centre each dash on the ball's vertical axis so it crosses both arcs of
    // the seam. Following the ellipse with cos(a) would put every stitch on the
    // right-hand arc, because cosine never goes negative over this range.
    const sx = cx;
    // One dash centred on the seam, so the stitching is symmetric about it.
    const len = s * 0.055 * scale;
    c.bar(
      sx - len / 2,
      sy - Math.max(1.5, s * 0.009 * scale) / 2,
      len,
      Math.max(1.5, s * 0.009 * scale),
      [...BG.slice(0, 3), 150],
    );
  }
}

// --- outputs ---------------------------------------------------------------

function iconTile(size) {
  const c = new Canvas(size);
  c.roundedFill(CARD, size * 0.22);
  // Subtle vignette so the tile is not flat.
  for (let y = 0; y < size; y++) {
    const t = y / size;
    for (let x = 0; x < size; x++) {
      if (c.data[(y * size + x) * 4 + 3] === 0) continue;
      c.set(x, y, [BG[0], BG[1], BG[2], Math.round(90 * t)]);
    }
  }
  drawMark(c);
  return encodePng(size, size, c.data);
}

function adaptiveForeground(size) {
  // Android crops to a circle and applies its own mask, so the artwork must
  // sit inside roughly the middle two thirds and the background stays clear.
  const c = new Canvas(size);
  c.fill(CLEAR);
  drawMark(c, 0.66);
  return encodePng(size, size, c.data);
}

function splash(size) {
  const c = new Canvas(size);
  c.fill(CLEAR);
  drawMark(c, 0.8);
  return encodePng(size, size, c.data);
}

function favicon(size) {
  const c = new Canvas(size);
  c.roundedFill(CARD, size * 0.2);
  drawMark(c, 1.05);
  return encodePng(size, size, c.data);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ['icon.png', iconTile(1024)],
  ['adaptive-icon.png', adaptiveForeground(1024)],
  ['splash-icon.png', splash(1024)],
  ['favicon.png', favicon(64)],
  ['notification-icon.png', adaptiveForeground(96)],
];

for (const [name, buf] of files) {
  writeFileSync(path.join(OUT, name), buf);
  console.log(`  ${name.padEnd(24)} ${String(buf.length).padStart(7)} bytes`);
}
console.log(`\n  Wrote ${files.length} icons to assets/`);
