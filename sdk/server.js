// Tiny static file server for the Spectator demo page.
// Serves everything in this folder (including dist/) on http://localhost:4321
// CORS is wide open so the demo can load the SDK bundle from any origin.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 4321;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".map":  "application/json",
};

http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/demo.html" : req.url.split("?")[0];
  const filePath = path.join(ROOT, urlPath);

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end("forbidden"); return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end(`404 — ${urlPath} not found`);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "text/plain",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`IKHAYA demo serving at http://localhost:${PORT}/demo.html`);
});
