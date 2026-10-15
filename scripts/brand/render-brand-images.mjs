// Render every browser icon and the link preview from their two sources:
//   app/icon.svg                          → tab icon (vector, served as is)
//   public/brand/apuhan-ciftligi-logo.png → the round farm badge
//
// Usage:
//   node scripts/brand/render-brand-images.mjs
//
// Writes:
//   app/favicon.ico                         16/32/48 px, for clients that only ask for /favicon.ico
//   app/apple-icon.png                      180 px, iOS home screen
//   public/brand/apuhan-icon-192.png        web manifest (any)
//   public/brand/apuhan-icon-512.png        web manifest (any)
//   public/brand/apuhan-icon-maskable-512.png  web manifest (maskable, Android)
//   public/brand/apuhan-email-logo.png      264 px, auth emails (shown at 88 px; email cannot use SVG)
//   public/brand/apuhan-onizleme.jpg        1200x630 link preview, from apuhan-onizleme.html
//                                           (JPEG: WhatsApp skips preview images over ~300 KB)
//
// sharp is not a direct dependency; it is resolved through next, which ships
// it for image optimisation. The preview is rendered by a local Chrome (set
// CHROME to override the macOS default path) so the storefront's real web
// fonts are used. Re-run after changing either source, then commit the output.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..", "..");
const fromRoot = (...parts) => path.join(root, ...parts);
const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp");

const ICON_SVG = fromRoot("app", "icon.svg");
const BADGE = fromRoot("public", "brand", "apuhan-ciftligi-logo.png");
const PAPER = "#fcfbf4"; // the badge's own background

/** The badge's square PNG cut to its circle, transparent outside. */
async function roundBadge(size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
  );
  return sharp(BADGE)
    .resize(size, size, { kernel: "lanczos3" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

/** The badge centred on a solid square, `scale` of the square's side. */
async function badgeOnSquare(size, scale) {
  const inner = Math.round(size * scale);
  const offset = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: await roundBadge(inner), left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** PNG-in-ICO container (supported by every browser since IE Vista era). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...pngs.map((png) => png.data)]);
}

async function write(relative, data) {
  fs.writeFileSync(fromRoot(relative), data);
  const { width, height } = await sharp(data).metadata();
  process.stdout.write(`${relative}  ${width}x${height}  ${(data.length / 1024).toFixed(1)} KB\n`);
}

const favicons = [];
for (const size of [16, 32, 48]) {
  // Rasterise the vector at the target size, not a downscale of a big render,
  // so the thin ring and the counter of the "A" stay crisp.
  const data = await sharp(ICON_SVG, { density: (72 * size) / 64 })
    .resize(size, size)
    .png()
    .toBuffer();
  favicons.push({ size, data });
}
fs.writeFileSync(fromRoot("app", "favicon.ico"), ico(favicons));
process.stdout.write("app/favicon.ico  16, 32, 48\n");

// iOS rounds the corners itself and shows no transparency.
await write("app/apple-icon.png", await badgeOnSquare(180, 0.9));
await write("public/brand/apuhan-icon-192.png", await roundBadge(192));
await write("public/brand/apuhan-icon-512.png", await roundBadge(512));
// Maskable: Android may cut the icon to any shape inside the central 80%
// circle, so the badge sits at 78% on its own paper colour.
await write("public/brand/apuhan-icon-maskable-512.png", await badgeOnSquare(512, 0.78));

// Email: 3x the 88px display size, 8-bit palette to keep it light for mail
// clients. Transparent corners sit on the template's cream background.
await write(
  "public/brand/apuhan-email-logo.png",
  await sharp(await roundBadge(264)).png({ palette: true, quality: 95, effort: 10 }).toBuffer(),
);

const chrome =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const shot = fromRoot("public", "brand", "apuhan-onizleme.raw.png");
execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=8000", // let the web fonts finish loading
  "--allow-file-access-from-files",
  `--screenshot=${shot}`,
  pathToFileURL(fromRoot("scripts", "brand", "apuhan-onizleme.html")).href,
], { stdio: "ignore" });
const preview = await sharp(shot).jpeg({ quality: 86, mozjpeg: true }).toBuffer();
fs.rmSync(shot);
await write("public/brand/apuhan-onizleme.jpg", preview);
