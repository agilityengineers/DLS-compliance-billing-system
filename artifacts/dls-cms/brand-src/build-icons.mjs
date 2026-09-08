/* brand-src/build-icons.mjs — regenerate every app icon from monkey-head.svg.
 *
 *   npm install --no-save sharp png-to-ico
 *   node build-icons.mjs
 *
 * monkey-head.svg is the only hand-edited file. This script derives the badge
 * SVGs from it and rasterizes the favicon, PWA and Apple icons under public/.
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

const PLUM = "#4A3D63";   // brand plum — favicon + PWA badge, manifest theme_color
const AVATAR = "#685582"; // the purple the in-app avatar already uses

// Pull the artwork group and its authoring viewBox out of the hand-edited source.
const source = fs.readFileSync(path.join(HERE, "monkey-head.svg"), "utf8");
const monkey = source.slice(source.indexOf('<g id="monkey"'), source.lastIndexOf("</g>") + 4);
const [bx, by, bw, bh] = source.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const cx = bx + bw / 2;
const cy = by + bh / 2;

const open = (size, viewBox) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" ` +
  `role="img" aria-label="Durable Life Skills monkey mascot">`;

/** The head alone: tight viewBox, transparent background. */
const headOnly = () =>
  [open(Math.round(bw), `${bx} ${by} ${bw} ${bh}`), "  <title>Durable Life Skills mascot</title>", monkey, "</svg>"].join("\n");

/** The head centred on a plum badge, scaled to `scale` of a 512 box. */
const badge = ({ shape, bg, scale }) =>
  [
    open(512, "0 0 512 512"),
    "  <title>Durable Life Skills</title>",
    shape === "circle"
      ? `  <circle cx="256" cy="256" r="256" fill="${bg}"/>`
      : `  <rect width="512" height="512" fill="${bg}"/>`,
    `  <g transform="translate(256 256) scale(${scale}) translate(${-cx} ${-cy})">`,
    monkey,
    "  </g>",
    "</svg>",
  ].join("\n");

const svgs = {
  head: headOnly(),
  favicon: badge({ shape: "circle", bg: PLUM, scale: 0.94 }),
  avatar: badge({ shape: "circle", bg: AVATAR, scale: 0.94 }),
  apple: badge({ shape: "rect", bg: PLUM, scale: 0.86 }),
  maskable: badge({ shape: "rect", bg: PLUM, scale: 0.78 }),
};

const png = (svg, size) =>
  sharp(Buffer.from(svg), { density: 1400 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

const writeSrc = (name, body) => fs.writeFileSync(path.join(HERE, name), body);
const writePub = (rel, body) => {
  const dest = path.join(PUB, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  console.log(`  ${rel} — ${fs.statSync(dest).size} bytes`);
};

writeSrc("favicon.svg", svgs.favicon);
writeSrc("apple-touch-icon.svg", svgs.apple);
writeSrc("icon-maskable.svg", svgs.maskable);

console.log("wrote:");
writePub("favicon.svg", svgs.favicon);
writePub("favicon.ico", await pngToIco(await Promise.all([16, 32, 48].map((s) => png(svgs.favicon, s)))));
writePub("brand/dls-monkey-head.svg", svgs.head);
writePub(
  "brand/dls-monkey-head.png",
  await sharp(Buffer.from(svgs.head), { density: 1400 })
    .resize(1024, null, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
);
writePub("brand/dls-mascot.png", await png(svgs.avatar, 256));
writePub("icons/icon-192.png", await png(svgs.favicon, 192));
writePub("icons/icon-512.png", await png(svgs.favicon, 512));
writePub("icons/icon-512-maskable.png", await png(svgs.maskable, 512));
writePub("icons/apple-touch-icon.png", await png(svgs.apple, 180));
