/* brand-src/build-icons.mjs — regenerate every app icon from monkey-head.png.
 *
 *   npm install --no-save sharp png-to-ico
 *   node build-icons.mjs
 *
 * monkey-head.png is the approved transparent mascot artwork. This script
 * derives the favicon, PWA, Apple and default-profile images under public/.
 * Remember to bump SHELL_CACHE in public/sw.js afterwards — the service worker
 * serves /icons/ and /brand/ cache-first.
 */
import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, "../public");

const SOURCE = path.join(HERE, "monkey-head.png");
const PLUM = "#4A3D63";

const png = async (size, { scale = 0.92, background = { r: 0, g: 0, b: 0, alpha: 0 } } = {}) => {
  const inset = await sharp(SOURCE)
    .trim()
    .resize(Math.round(size * scale), Math.round(size * scale), { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: inset, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
};

const writePub = (rel, body) => {
  const dest = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`  ${rel} — ${fs.statSync(dest).size} bytes`);
};

console.log("wrote:");
writePub("favicon.png", await png(512, { scale: 0.9 }));
writePub("favicon.ico", await pngToIco(await Promise.all([16, 32, 48].map((size) => png(size, { scale: 0.9 })))));
writePub("brand/dls-monkey-head.png", await png(512, { scale: 0.9 }));
writePub("brand/dls-mascot.png", await png(256, { scale: 0.9 }));
writePub("icons/icon-192.png", await png(192, { scale: 0.9 }));
writePub("icons/icon-512.png", await png(512, { scale: 0.9 }));
writePub("icons/icon-512-maskable.png", await png(512, { scale: 0.72, background: PLUM }));
writePub("icons/apple-touch-icon.png", await png(180, { scale: 0.82, background: PLUM }));
