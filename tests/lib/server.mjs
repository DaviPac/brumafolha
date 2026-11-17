// A small static server like tools/serve.py (no cache), whose folder can be switched while it runs: the update test
// serves an old version, then the new one at the same address (same origin, so the same saves and service worker).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".md": "text/plain; charset=utf-8" };

export async function serve(root, port = 0) {
  let dir = path.resolve(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    let p = path.join(dir, decodeURIComponent(url.pathname));
    if (!p.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(p)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return {
    url: `http://localhost:${server.address().port}/`,
    /** Serve another folder from now on, at the same address. */
    setRoot(r) { dir = path.resolve(r); },
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}
