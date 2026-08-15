// Render the Apuhan Çiftliği brand mark to a PNG for use in transactional email.
//
// Usage:
//   node scripts/render-email-logo.mjs
//
// Why a script and not the SVG: `app/icon.svg` is the source of truth for the
// brand mark, but no mail client renders inline or linked SVG (Gmail strips it,
// Outlook never supported it), so email needs a raster copy at an absolute URL.
// macOS has no reliable SVG rasterizer preinstalled — qlmanage crops — and
// adding sharp/imagemagick just for one asset is not worth the dependency, so
// this redraws the same shapes (rounded square + egg + highlight arc, same
// gradients) with a tiny hand-rolled PNG encoder: zero dependencies, byte-for-
// byte reproducible.
//
// Re-run this if app/icon.svg changes, then commit the PNG.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = path.resolve(
  import.meta.dirname,
  "..",
  "public",
  "brand",
  "apuhan-logo.png",
);

const SIZE = 256; // final pixels; displayed at 56px in email (4.5x for retina)
const SS = 3; // supersampling factor for anti-aliasing
const W = SIZE * SS;
const k = W / 64; // app/icon.svg uses a 64-unit viewBox

// --- palette (identical to app/icon.svg) --------------------------------
const BG_TOP = [0xe7, 0xab, 0x50];
const BG_BOTTOM = [0xbe, 0x7c, 0x2a];
const EGG_TOP = [0xff, 0xfc, 0xf5];
const EGG_BOTTOM = [0xf1, 0xe3, 0xc8];

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c0, c1, t) => [
  lerp(c0[0], c1[0], t),
  lerp(c0[1], c1[1], t),
  lerp(c0[2], c1[2], t),
];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// --- geometry -----------------------------------------------------------
const RADIUS = 16 * k; // rx="16" on the 64-unit square

function insideRoundedSquare(x, y) {
  if (x < 0 || y < 0 || x > W || y > W) return false;
  const dx = x < RADIUS ? RADIUS - x : x > W - RADIUS ? x - (W - RADIUS) : 0;
  const dy = y < RADIUS ? RADIUS - y : y > W - RADIUS ? y - (W - RADIUS) : 0;
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

// Egg: an ellipse whose width profile is skewed so the top is pointier than
// the bottom — the same silhouette the SVG draws with two cubic curves.
const EGG_CX = 32 * k;
const EGG_TOP_Y = 12 * k;
const EGG_BOTTOM_Y = 51 * k;
const EGG_CY = (EGG_TOP_Y + EGG_BOTTOM_Y) / 2;
const EGG_HALF_H = (EGG_BOTTOM_Y - EGG_TOP_Y) / 2;
const EGG_SKEW = 0.18;
// Normalize so the widest point is exactly 12 units (the SVG's half-width).
const EGG_PEAK = (() => {
  let peak = 0;
  for (let i = 0; i <= 1000; i++) {
    const u = -1 + (2 * i) / 1000;
    peak = Math.max(peak, Math.sqrt(1 - u * u) * (1 + EGG_SKEW * u));
  }
  return peak;
})();
const EGG_A = (12 * k) / EGG_PEAK;

function insideEgg(x, y) {
  const u = (y - EGG_CY) / EGG_HALF_H;
  if (u < -1 || u > 1) return false;
  const halfWidth = EGG_A * Math.sqrt(1 - u * u) * (1 + EGG_SKEW * u);
  return Math.abs(x - EGG_CX) <= halfWidth;
}

// Egg gradient axis: x1/y1 24,14 → x2/y2 40,50 in viewBox units.
const G0 = [24 * k, 14 * k];
const G1 = [40 * k, 50 * k];
const GD = [G1[0] - G0[0], G1[1] - G0[1]];
const GLEN2 = GD[0] * GD[0] + GD[1] * GD[1];

function eggColor(x, y) {
  const t = clamp01(((x - G0[0]) * GD[0] + (y - G0[1]) * GD[1]) / GLEN2);
  return mix(EGG_TOP, EGG_BOTTOM, t);
}

// --- highlight arc ------------------------------------------------------
// SVG: M26.6 22.5 c -2.2 1.8 -3.6 4.6 -3.9 7.7  (stroke white @ 0.55, w 2.4)
const ARC = [
  [26.6 * k, 22.5 * k],
  [24.4 * k, 24.3 * k],
  [23.0 * k, 27.1 * k],
  [22.7 * k, 30.2 * k],
];
const ARC_RADIUS = (2.4 * k) / 2;
const ARC_ALPHA = 0.55;

/** Coverage mask for the round-capped stroke: max, not sum, so overlapping
 * stamps along the curve don't compound into a darker streak. */
function buildArcMask() {
  const mask = new Float32Array(W * W);
  const steps = 600;
  const r = ARC_RADIUS;
  const rOuter = Math.ceil(r + 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const cx =
      mt * mt * mt * ARC[0][0] +
      3 * mt * mt * t * ARC[1][0] +
      3 * mt * t * t * ARC[2][0] +
      t * t * t * ARC[3][0];
    const cy =
      mt * mt * mt * ARC[0][1] +
      3 * mt * mt * t * ARC[1][1] +
      3 * mt * t * t * ARC[2][1] +
      t * t * t * ARC[3][1];
    const x0 = Math.max(0, Math.floor(cx - rOuter));
    const x1 = Math.min(W - 1, Math.ceil(cx + rOuter));
    const y0 = Math.max(0, Math.floor(cy - rOuter));
    const y1 = Math.min(W - 1, Math.ceil(cy + rOuter));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const cov = clamp01(r + 0.5 - d);
        const idx = y * W + x;
        if (cov > mask[idx]) mask[idx] = cov;
      }
    }
  }
  return mask;
}

// --- render at SS resolution, then box-downsample ------------------------
const arcMask = buildArcMask();
const hi = new Float32Array(W * W * 4); // straight RGBA, 0..255 / 0..1

for (let y = 0; y < W; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    if (!insideRoundedSquare(x + 0.5, y + 0.5)) continue;

    let color = mix(BG_TOP, BG_BOTTOM, (y + 0.5) / W);
    if (insideEgg(x + 0.5, y + 0.5)) color = eggColor(x + 0.5, y + 0.5);

    const a = arcMask[y * W + x] * ARC_ALPHA;
    if (a > 0) color = mix(color, [255, 255, 255], a);

    hi[idx] = color[0];
    hi[idx + 1] = color[1];
    hi[idx + 2] = color[2];
    hi[idx + 3] = 1;
  }
}

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * W + (x * SS + sx)) * 4;
        // Premultiply before averaging so transparent pixels don't drag the
        // edge colour toward black.
        r += hi[i] * hi[i + 3];
        g += hi[i + 1] * hi[i + 3];
        b += hi[i + 2] * hi[i + 3];
        a += hi[i + 3];
      }
    }
    const o = (y * SIZE + x) * 4;
    if (a > 0) {
      rgba[o] = Math.round(r / a);
      rgba[o + 1] = Math.round(g / a);
      rgba[o + 2] = Math.round(b / a);
    }
    rgba[o + 3] = Math.round((a / (SS * SS)) * 255);
  }
}

// --- minimal PNG encoder -------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA
// 10..12 stay 0: deflate / adaptive filtering / no interlace

// One filter byte (0 = None) per scanline.
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  rgba.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, png);
process.stdout.write(`${OUT} — ${SIZE}x${SIZE}, ${png.length} bytes\n`);
