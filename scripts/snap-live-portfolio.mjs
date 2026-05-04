// Visual smoke test: load the deployed personal site and capture the
// Projects section so we can confirm Spectator shipped.
import { chromium } from "playwright";
const URL = process.env.URL || "https://hodoabdirizak.github.io/#projects";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.evaluate(() => document.querySelector("#projects")?.scrollIntoView({ block: "start" }));
await page.waitForTimeout(800);
await page.screenshot({ path: "/tmp/live-portfolio-projects.png", fullPage: false });
console.log("OK — /tmp/live-portfolio-projects.png");
await browser.close();
