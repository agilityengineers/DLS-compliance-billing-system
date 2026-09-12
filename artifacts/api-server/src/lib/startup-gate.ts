import type { RequestListener } from "node:http";

/** Bind the HTTP server before initialization without serving incomplete data. */
export function createStartupGate() {
  let handler: RequestListener | undefined;
  const listener: RequestListener = (req, res) => {
    if (handler) {
      handler(req, res);
      return;
    }
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "5",
    });
    res.end(JSON.stringify({ status: "starting" }));
  };
  return {
    listener,
    ready(app: RequestListener) {
      handler = app;
    },
  };
}