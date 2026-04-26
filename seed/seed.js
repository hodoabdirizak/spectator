#!/usr/bin/env node
// =============================================================
// Spectator demo-data seeder
// =============================================================
// Opens a WebSocket to /ingest and pushes a handful of realistic
// recorded sessions so the dashboard has something to show on
// first visit. Exits when the server has ack'd the final batch.
//
// Usage:
//   npm install
//   node seed.js                   # default: 8 sessions
//   node seed.js --sessions 25     # more sessions for heatmap density
//   node seed.js --url ws://x:8080/ingest   # override target server
//
// Uses the same WebSocket frame shape the SDK uses — batches of
// RecordingMessage[] — so this exercises the real ingest path.
// =============================================================

const WebSocket = require("ws");

// ---------- CLI args ---------------------------------------------------------

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  return args[i + 1];
}

const SESSION_COUNT = Number(flag("sessions", 8));
const SERVER_URL    = flag("url", "ws://localhost:8080/ingest");

// ---------- Session personas ------------------------------------------------
// Each persona produces a different engagement shape so the funnel and
// heatmap are visibly varied instead of everyone behaving identically.

const PERSONAS = [
  { name: "bounce",     clicks: 0,  scrolls: 0, inputs: 0, spreadRadius: 0,   ageMinutes: 42  },
  { name: "browser",    clicks: 1,  scrolls: 1, inputs: 0, spreadRadius: 120, ageMinutes: 31  },
  { name: "engaged",    clicks: 5,  scrolls: 3, inputs: 1, spreadRadius: 260, ageMinutes: 18  },
  { name: "power",      clicks: 9,  scrolls: 5, inputs: 3, spreadRadius: 340, ageMinutes: 12  },
  { name: "converter",  clicks: 7,  scrolls: 4, inputs: 2, spreadRadius: 180, ageMinutes: 8   },
  { name: "dropoff",    clicks: 2,  scrolls: 1, inputs: 0, spreadRadius: 90,  ageMinutes: 25  },
  { name: "nav",        clicks: 6,  scrolls: 0, inputs: 0, spreadRadius: 400, ageMinutes: 4   },
  { name: "live",       clicks: 3,  scrolls: 2, inputs: 1, spreadRadius: 220, ageMinutes: 0   },
];

// Hotspots where real users click on a landing page (nav / hero CTA /
// card grid / footer CTA). Coordinates are in viewport px.
const HOTSPOTS = [
  { x: 140,  y: 40,  label: "logo"        },
  { x: 980,  y: 44,  label: "nav-right"   },
  { x: 640,  y: 280, label: "hero-cta"    },
  { x: 380,  y: 520, label: "card-1"      },
  { x: 640,  y: 520, label: "card-2"      },
  { x: 900,  y: 520, label: "card-3"      },
  { x: 640,  y: 640, label: "footer-cta"  },
];

// ---------- Helpers ----------------------------------------------------------

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pickHotspot() {
  return HOTSPOTS[Math.floor(Math.random() * HOTSPOTS.length)];
}

// jitter a hotspot by N px in both directions so the heatmap gets cells
// around the center rather than a single burning pixel.
function jitterAround(hotspot, radius) {
  return {
    x: Math.round(hotspot.x + randBetween(-radius, radius)),
    y: Math.round(hotspot.y + randBetween(-radius, radius)),
  };
}

function sessionId(persona, i) {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${persona.name}-${String(i).padStart(2, "0")}-${rand}`;
}

// A minimal serialized DOM the player can still render as "something"
// (the seeded sessions are optimized for the dashboard pages, not for
// pixel-perfect replay).
function mockSnapshot() {
  return {
    nodeType: 1,
    nodeId: 1,
    tagName: "html",
    attributes: { lang: "en" },
    children: [
      {
        nodeType: 1, nodeId: 2, tagName: "head", attributes: {},
        children: [
          { nodeType: 1, nodeId: 3, tagName: "title", attributes: {}, children: [
            { nodeType: 3, nodeId: 4, textContent: "Demo session (seeded)" },
          ] },
        ],
      },
      {
        nodeType: 1, nodeId: 5, tagName: "body",
        attributes: { style: "font-family:system-ui;padding:40px;background:#fafafa" },
        children: [
          { nodeType: 1, nodeId: 6, tagName: "h1", attributes: {}, children: [
            { nodeType: 3, nodeId: 7, textContent: "Spectator demo session" },
          ] },
          { nodeType: 1, nodeId: 8, tagName: "p", attributes: {}, children: [
            { nodeType: 3, nodeId: 9, textContent: "This page was recorded by the seed script." },
          ] },
        ],
      },
    ],
  };
}

// ---------- Per-session generator -------------------------------------------

function generateSession(persona, index) {
  const id = sessionId(persona, index);
  const startTime = Date.now() - persona.ageMinutes * 60 * 1000;
  const messages = [];

  // 1. Initial snapshot at session start
  messages.push({
    type: "snapshot", data: mockSnapshot(),
    timestamp: startTime, sessionId: id,
  });

  // 2. A handful of mousemove events (spread during the session)
  const moveEvents = [];
  const moveCount = 6 + Math.floor(Math.random() * 10);
  for (let i = 0; i < moveCount; i++) {
    const p = jitterAround(pickHotspot(), persona.spreadRadius || 100);
    moveEvents.push({
      type: "mousemove", x: p.x, y: p.y,
      timestamp: startTime + Math.floor(i * 200 + Math.random() * 150),
    });
  }
  if (moveEvents.length > 0) {
    messages.push({
      type: "events", data: moveEvents,
      timestamp: startTime + 200, sessionId: id,
    });
  }

  // 3. Clicks — clustered around hotspots
  const clickEvents = [];
  for (let i = 0; i < persona.clicks; i++) {
    const p = jitterAround(pickHotspot(), persona.spreadRadius);
    clickEvents.push({
      type: "click", x: p.x, y: p.y, targetId: null,
      timestamp: startTime + Math.floor(1500 + i * 1800 + Math.random() * 400),
    });
  }
  if (clickEvents.length > 0) {
    messages.push({
      type: "events", data: clickEvents,
      timestamp: startTime + 1500, sessionId: id,
    });
  }

  // 4. Scrolls — progressive Y as the user scrolls down
  const scrollEvents = [];
  for (let i = 0; i < persona.scrolls; i++) {
    scrollEvents.push({
      type: "scroll", x: 0, y: (i + 1) * 240,
      timestamp: startTime + Math.floor(2200 + i * 900 + Math.random() * 300),
    });
  }
  if (scrollEvents.length > 0) {
    messages.push({
      type: "events", data: scrollEvents,
      timestamp: startTime + 2200, sessionId: id,
    });
  }

  // 5. Inputs — masked text
  const inputEvents = [];
  for (let i = 0; i < persona.inputs; i++) {
    inputEvents.push({
      type: "input", targetId: 12 + i, value: "********",
      timestamp: startTime + Math.floor(3000 + i * 1400 + Math.random() * 200),
    });
  }
  if (inputEvents.length > 0) {
    messages.push({
      type: "events", data: inputEvents,
      timestamp: startTime + 3000, sessionId: id,
    });
  }

  // 6. A single DOM mutation mid-session so the Events page shows a
  //    "mutation" category entry too.
  messages.push({
    type: "mutations",
    data: [{ kind: "characterData", nodeId: 9, textContent: "User scrolled the page." }],
    timestamp: startTime + 2500, sessionId: id,
  });

  return messages;
}

// ---------- Main -------------------------------------------------------------

async function main() {
  console.log(`[seed] connecting to ${SERVER_URL}`);
  const ws = new WebSocket(SERVER_URL);

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
    setTimeout(() => reject(new Error("WebSocket connect timeout — is the Go server running?")), 5000);
  });
  console.log(`[seed] connected, generating ${SESSION_COUNT} sessions`);

  let totalMessages = 0;

  for (let i = 0; i < SESSION_COUNT; i++) {
    const persona = PERSONAS[i % PERSONAS.length];
    const batch = generateSession(persona, i);
    ws.send(JSON.stringify(batch));
    totalMessages += batch.length;
    console.log(`  [${String(i + 1).padStart(2)}/${SESSION_COUNT}] ${persona.name.padEnd(10)} — ${batch.length} messages, ${persona.clicks} clicks`);
    // Space out sends slightly so the server's store doesn't race and so
    // the WebSocket write buffer doesn't back up.
    await new Promise(r => setTimeout(r, 40));
  }

  // Give the server a moment to write the final batch, then close cleanly.
  await new Promise(r => setTimeout(r, 300));
  ws.close();
  console.log(`[seed] done — sent ${totalMessages} messages across ${SESSION_COUNT} sessions`);
}

main().catch(err => {
  console.error(`[seed] failed: ${err.message}`);
  process.exit(1);
});
