import { cpSync, readFileSync, renameSync, statSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

// Keep the approved GitHub website as the source of truth, separate from the SPA.
const site = path.resolve(import.meta.dirname, "../../site");
const pages = new Set(["index.html", "about.html", "services.html", "contact.html"]);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

export function marketingSite(): Plugin {
  let output = "";
  return {
    name: "dls-marketing-site",
    configResolved(config) {
      output = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();
        const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
        const relative = pathname === "/" ? "index.html" : pathname.slice(1);
        if (!pages.has(relative) && !/^(assets|css|js)\//.test(relative)) return next();
        const file = path.resolve(site, relative);
        if (!file.startsWith(site + path.sep)) return next();
        try {
          if (!statSync(file).isFile()) return next();
          res.setHeader("Content-Type", types[path.extname(file)] ?? "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.end(req.method === "HEAD" ? undefined : readFileSync(file));
        } catch {
          next();
        }
      });
    },
    closeBundle() {
      // Preserve the compiled portal entry for /login, /admin/* and /field/*.
      renameSync(path.join(output, "index.html"), path.join(output, "portal.html"));
      for (const entry of [...pages, "assets", "css", "js"]) {
        cpSync(path.join(site, entry), path.join(output, entry), { recursive: true });
      }
    },
  };
}
