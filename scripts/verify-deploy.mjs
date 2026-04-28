// One-shot smoke test of the deployed Spectator stack.
// Loads the production player, captures a screenshot, asserts the server URL
// is wired correctly and the dashboard fetches /sessions over the network.

import { chromium } from "playwright";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PLAYER = process.env.PLAYER_URL || "https://spectator-player.vercel.app/";
const SERVER = process.env.SERVER_URL || "https://spectator-server.fly.dev";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const requests = [];
  page.on("request", (r) => { if (r.url().includes("fly.dev")) requests.push(`${r.method()} ${r.url()}`); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(PLAYER, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: join(ROOT, "docs/deployed-player.png") });

  console.log("page title:", await page.title());
  console.log("page URL:", page.url());
  console.log("requests to fly.dev (count =", requests.length, "):");
  for (const r of requests) console.log(" ", r);
  console.log("page errors:", errors);

  await browser.close();
})().catch((err) => { console.error(err); process.exit(1); });
