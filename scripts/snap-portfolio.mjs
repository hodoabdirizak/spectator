// Smoke-test the local portfolio static export by serving the `out/` dir
// over a tiny static server, opening the page in headless chromium, and
// screenshotting the projects section so we can eyeball the new entry.

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const OUT = "/Users/hodoabdirizak/2026_Resume/portfolio/out";
const PORT = 4567;

const server = http.createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = path.join(OUT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    const ext = path.extname(fp);
    const ct = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": ct }); res.end(data);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(`http://localhost:${PORT}/#projects`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

await page.screenshot({ path: "/tmp/portfolio-projects.png", fullPage: false });
// Also full-page so we get the whole list
await page.evaluate(() => document.querySelector("#projects")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(700);
await page.screenshot({ path: "/tmp/portfolio-projects-section.png", fullPage: false });

console.log("OK — wrote /tmp/portfolio-projects.png and /tmp/portfolio-projects-section.png");
await browser.close();
server.close();
