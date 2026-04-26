// Captures screenshots of every page in the Spectator player and saves them
// to docs/. The replay screenshot needs a session that has a real DOM
// snapshot, not a synthetic seed — so this script first drives the demo
// store to record a real session, then drives the player to replay it.
//
//   make dev      # in one terminal
//   make seed     # in another (or `cd seed && node seed.js --sessions 12`)
//   node scripts/capture-screenshots.mjs
//
// Requires playwright to be installed locally:
//
//   cd scripts && npm install
//   npx playwright install chromium
//
// Output (overwrites if present):
//   docs/sessions.png
//   docs/replay.png
//   docs/heatmaps.png
//   docs/funnels.png
//   docs/events.png
//   docs/demo-store.png

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = join(ROOT, "docs");
const PLAYER = process.env.PLAYER_URL || "http://localhost:5173";
const DEMO   = process.env.DEMO_URL   || "http://localhost:4321/demo.html?server=http://localhost:8080";
const SERVER = process.env.SERVER_URL || "http://localhost:8080";

const VIEW = { width: 1440, height: 900 };

async function shoot(page, path) {
  await page.screenshot({ path, fullPage: false });
  console.log("→", path);
}

async function clickByText(page, text) {
  await page.locator(`button:has-text("${text}")`).first().click();
  await page.waitForTimeout(400);
}

// Drive the demo store enough to produce a rich, replayable session.
async function recordDemoSession(ctx) {
  const page = await ctx.newPage();
  await page.goto(DEMO, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Snapshot of the demo store front page for docs/demo-store.png.
  await shoot(page, join(DOCS, "demo-store.png"));

  // Scroll, click a few cards, fill a couple of fields. This pumps mouse,
  // click, scroll, input, and DOM mutation events through the SDK.
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);

  const ctas = await page.$$(".card .card-cta");
  for (const idx of [0, 2, 4]) {
    const el = ctas[idx];
    if (el) { await el.click(); await page.waitForTimeout(250); }
  }

  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);

  for (const [sel, val] of [["#name", "Maya Patel"], ["#email", "maya@example.com"]]) {
    const el = await page.$(sel);
    if (el) { await el.fill(val); await page.waitForTimeout(150); }
  }

  // Let the SDK flush its 1s buffer and close the connection cleanly.
  await page.waitForTimeout(1500);
  const sessionId = await page.evaluate(() => {
    const el = document.getElementById("session-id-display");
    return el ? el.textContent.trim() : null;
  });
  await page.close();
  return sessionId;
}

// Pick the freshest server-side session that has a real snapshot+pageUrl,
// in case the in-page __spectator hook isn't exposed.
async function findFreshRealSession() {
  const res = await fetch(`${SERVER}/sessions`);
  const sessions = await res.json();
  sessions.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));
  for (const s of sessions) {
    const r = await fetch(`${SERVER}/sessions/${s.id}`);
    const events = await r.json();
    const hasSnap = events.some((e) => e.type === "snapshot" && e.pageUrl);
    if (hasSnap) return s.id;
  }
  return null;
}

(async () => {
  await mkdir(DOCS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });

  // Step 1 — drive demo to produce a fresh, replayable session.
  const recordedId = await recordDemoSession(ctx);
  const sessionId = recordedId || await findFreshRealSession();
  if (!sessionId) {
    console.error("No session with a real DOM snapshot was found.");
    process.exit(1);
  }
  console.log("using session:", sessionId);

  const page = await ctx.newPage();

  // Step 2 — Sessions list
  await page.goto(PLAYER, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await shoot(page, join(DOCS, "sessions.png"));

  // Step 3 — Replay the recorded session.
  // Find the row containing the session ID, click its Replay button.
  const clicked = await page.evaluate((id) => {
    const all = [...document.querySelectorAll("div")].filter(d =>
      d.textContent.includes(id) && d.querySelector('button')
    );
    all.sort((a, b) => a.textContent.length - b.textContent.length);
    for (const div of all) {
      for (const btn of div.querySelectorAll("button")) {
        if (btn.textContent.trim() === "Replay" || btn.textContent.trim() === "Watch Live") {
          btn.click();
          return true;
        }
      }
    }
    return false;
  }, sessionId);
  if (!clicked) {
    await page.locator('button:has-text("Replay")').first().click();
  }
  console.log("clicked replay row matching id:", clicked);
  await page.waitForTimeout(3500); // allow snapshot + base href + stylesheet re-parse
  await shoot(page, join(DOCS, "replay.png"));

  // Step 4 — Heatmaps / Funnels / Events
  // Replay view takes over full screen; click the toolbar's "Sessions" to
  // return to the list (sidebar is hidden during replay).
  await page.locator('button:has-text("Sessions")').first().click();
  await page.waitForTimeout(600);

  await clickByText(page, "Heatmaps");
  await page.waitForTimeout(900);
  await shoot(page, join(DOCS, "heatmaps.png"));

  await clickByText(page, "Funnels");
  await page.waitForTimeout(900);
  await shoot(page, join(DOCS, "funnels.png"));

  await clickByText(page, "Events");
  await page.waitForTimeout(900);
  await shoot(page, join(DOCS, "events.png"));

  await browser.close();
  console.log("\nDone — screenshots written to", DOCS);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
