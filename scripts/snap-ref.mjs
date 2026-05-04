// Capture the reference site (full page + sections) so we can design from
// what's actually rendered, not the empty Framer shell.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const URL = process.argv[2] || "https://www.janarsiniloo.com/";
const OUT = "/tmp/ref";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
// Framer animations need time to settle.
await page.waitForTimeout(2500);

// Hero
await page.screenshot({ path: `${OUT}/hero.png` });

// Scroll through and capture each viewport-ish chunk
const totalH = await page.evaluate(() => document.documentElement.scrollHeight);
console.log("page height:", totalH);
let y = 0;
let i = 0;
const STEP = 800;
while (y < Math.min(totalH, 8000)) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/scroll-${String(i).padStart(2, "0")}.png` });
  y += STEP;
  i += 1;
}

// Pull computed style of body + first heading for color/font hints
const meta = await page.evaluate(() => {
  const body = document.body;
  const bs = getComputedStyle(body);
  const h = document.querySelector("h1, h2") || document.body;
  const hs = getComputedStyle(h);
  return {
    bodyBg: bs.backgroundColor,
    bodyColor: bs.color,
    bodyFont: bs.fontFamily,
    headingFont: hs.fontFamily,
    headingSize: hs.fontSize,
    headingWeight: hs.fontWeight,
    title: document.title,
  };
});
console.log("computed:", meta);

await browser.close();
console.log("OK — wrote", OUT);
