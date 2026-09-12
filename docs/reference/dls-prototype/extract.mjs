// docs/reference/dls-prototype/extract.mjs — recover the prototype's JSX sources.
//
// The reference repo (agilityengineers/DLS---Smart-Documentation-and-Billing-
// Application) ships as a single 2.3 MB index.html: a self-contained demo with
// no backend. Its app sources are gzipped + base64 inside a
// <script type="__bundler/manifest"> block, loaded in the browser through
// Babel. This script recovers them so the code can be read and diffed.
//
//   node extract.mjs /path/to/index.html [outDir]
//
// Vendor bundles (React, ReactDOM, Babel) are skipped — only app sources are
// written. Output file names come from NAMES below, in bundle load order.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

const [, , htmlPath, outDir = "./src"] = process.argv;
if (!htmlPath) {
  console.error("usage: node extract.mjs <index.html> [outDir]");
  process.exit(1);
}

/** App sources in bundle load order (vendor bundles excluded). */
const NAMES = [
  "01-mock-data", "02-hiring-data", "03-icons", "04-ui-primitives", "05-login",
  "06-dashboard", "07-documentation", "08-note-editor", "09-review-queue",
  "10-billing", "11-compliance", "12-authorizations-clients", "13-reports",
  "14-hiring-pipeline", "15-staff-credentialing", "16-careers-form",
  "17-mobile-field-app", "18-app-shell", "19-root-app"
];

const html = readFileSync(htmlPath, "utf8");
const lines = html.split("\n");

/** Payload of a <script type="__bundler/NAME"> block: the line after the tag. */
function payloadAfter(tag) {
  const i = lines.findIndex((l) => l.includes(`<script type="__bundler/${tag}">`));
  if (i < 0) throw new Error(`no __bundler/${tag} block found`);
  return lines[i + 1];
}

const manifest = JSON.parse(payloadAfter("manifest"));
// The template is the real <html> document, JSON-encoded; its <script src=UUID>
// order is the bundle's load order.
const template = JSON.parse(payloadAfter("template"));
const order = [...template.matchAll(/src="([0-9a-f-]{36})"/g)].map((m) => m[1]);

mkdirSync(outDir, { recursive: true });

// Vendor bundles load first and are not app code. Anything beyond the names we
// know about is written under its uuid rather than silently dropped.
const appUuids = order.slice(order.length - NAMES.length);
appUuids.forEach((uuid, i) => {
  const entry = manifest[uuid];
  if (!entry) throw new Error(`manifest has no entry for ${uuid}`);
  const raw = Buffer.from(entry.data, "base64");
  const source = entry.compressed ? gunzipSync(raw) : raw;
  const name = `${NAMES[i] ?? uuid}.jsx`;
  writeFileSync(join(outDir, name), source);
  console.log(`${name}  ${source.length} bytes`);
});
