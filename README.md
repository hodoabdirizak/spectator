# Spectator — Browser Session Replay Engine

[![ci](https://github.com/hodoabdirizak/spectator/actions/workflows/ci.yml/badge.svg)](https://github.com/hodoabdirizak/spectator/actions/workflows/ci.yml)
[![player](https://img.shields.io/badge/player-vercel-000?logo=vercel)](https://spectator-player.vercel.app)
[![server](https://img.shields.io/badge/server-fly.io-7B61FF?logo=flydotio)](https://spectator-server.fly.dev/healthz)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A full-stack session replay system built from scratch. Records what users do in a browser (DOM state, mouse movements, clicks, scrolls, form input) and replays it frame-perfectly — like a DVR for web sessions. Supports **live spectating** of in-progress sessions, **click heatmaps**, **funnel analytics**, and a raw **event stream** explorer.

Inspired by Fullstory, Hotjar, and LogRocket. Built to understand how they actually work.

> **Live demo:** player at <https://spectator-player.vercel.app> · server at <https://spectator-server.fly.dev/healthz>

![Sessions list](docs/sessions.png)
![Replay engine](docs/replay.png)

| Heatmaps | Funnels | Event stream |
|---|---|---|
| ![Click heatmap](docs/heatmaps.png) | ![Engagement funnel](docs/funnels.png) | ![Event stream](docs/events.png) |

> **Stack:** TypeScript SDK → Go WebSocket server (in-memory or Postgres) → React replay player. Runs anywhere a Dockerfile runs — deployed live to Fly.io + Vercel; instructions below also cover Railway.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (SDK)                                                       │
│                                                                      │
│  takeFullSnapshot()  ──────────────────────────────────────────────►│
│  MutationObserver    ──► recorder.ts ──► transport.ts ──► WS /ingest│
│  Event Listeners     ──────────────────────────────────────────────►│
└─────────────────────────────────────────────────────────────────────┘
                                          │
                             WebSocket (batched JSON, 1s / 50 evt)
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Go Server                                                           │
│                                                                      │
│  /ingest          WS ingest goroutine                                │
│                    │                                                 │
│                    ├──► Store   (MemoryStore or PostgresStore)       │
│                    └──► LiveHub ──► buffered chan per watcher ──┐    │
│                                                                 │    │
│  /watch/{id}      WS fan-out  ◄─────────────────────────────────┘    │
│  /sessions        GET list                                           │
│  /sessions/{id}   GET replay bundle                                  │
│  /stats/{id}      GET live watcher count                             │
│  /healthz         liveness probe                                     │
└─────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  React Player                                                        │
│                                                                      │
│  Sidebar ─► Sessions  ─► ReplayPlayer (iframe + cursor overlay)      │
│          ─► Heatmaps  (aggregated clicks, gaussian kernel, SVG)      │
│          ─► Funnels   (5-step loaded→engaged conversion)             │
│          ─► Events    (raw event stream, filterable, paginated)      │
│          ─► Settings  (SDK config helper + localStorage)             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features

| Feature | Details |
|---|---|
| **DOM Snapshot** | Full page serialized to JSON at session start — every element, attribute, and text node |
| **Mutation Streaming** | `MutationObserver` streams every DOM change: add/remove nodes, attribute changes, text edits |
| **User Events** | Mouse movements (throttled 50ms), clicks, scrolls, inputs, window resize |
| **Live Spectating** | Watch any active session in real-time via WebSocket fan-out |
| **Click Heatmaps** | SVG overlay with gaussian-kernel density, 32px grid, warm color ramp, `mixBlendMode: multiply` |
| **Funnel Analytics** | Five-step conversion funnel (loaded → moved → clicked → scrolled → engaged) computed client-side |
| **Event Explorer** | Flattened, sortable, filterable, paginated view of every captured event |
| **PII Masking** | `maskInputs: true` replaces typed values with `•••`; `data-spectator-mask` redacts DOM elements |
| **Reconnection** | Exponential backoff on WebSocket disconnect (1s → 2s → 4s … capped at 30s) |
| **Batching** | Events buffered and flushed every 1s or at 50 events — same pattern as Segment/Amplitude SDKs |
| **Replay Controls** | Play/pause, timeline scrubber, 0.5×/1×/2×/4× playback |
| **Postgres Persistence** | JSONB storage with prepared statements + session index; graceful fallback to in-memory if `DATABASE_URL` unset |

---

## Tech Stack

- **SDK** — TypeScript, `MutationObserver`, WebSocket API, DOM serialization (~12KB gzipped)
- **Server** — Go 1.22, `gorilla/websocket`, `database/sql` + `lib/pq`, prepared statements, connection-pool tuned
- **Player** — React 19 + Vite 7, `requestAnimationFrame` playback loop, sandboxed iframe
- **Storage** — Postgres 16 (JSONB) or in-memory fallback
- **Deploy** — Fly.io (server), Vercel (player), Neon/Supabase (Postgres)

---

## Quick Start

### One command (recommended)

```bash
make install    # one-time install of SDK, player, and seed dependencies
make dev        # boots server :8080, demo :4321, player :5173 in parallel
make seed       # in another terminal — seed 12 realistic sessions
```

Then open <http://localhost:5173> for the player and <http://localhost:4321/demo.html?server=http://localhost:8080> for the recordable demo store.

### Manual (in-memory, no Postgres)

```bash
# 1. Server (in-memory, no Postgres needed)
cd server && go run .
# → Spectator server running on :8080

# 2. Player
cd player && npm install && npm run dev
# → http://localhost:5173

# 3. Seed realistic sessions
cd seed && npm install && node seed.js --sessions 8
# → 41 messages across 8 sessions stored

# 4. Open http://localhost:5173 — browse Sessions / Heatmaps / Funnels / Events
```

### With Postgres

```bash
# 1. Boot Postgres + auto-apply migrations
docker compose up -d

# 2. Server, pointed at Postgres
cd server
DATABASE_URL="postgres://spectator:spectator@localhost:5432/spectator?sslmode=disable" go run .

# 3. Player + seed same as above
```

The server auto-detects `DATABASE_URL` — if unset, it logs `DATABASE_URL unset — using in-memory store` and keeps going. Same API either way.

### Record a real page

```js
import { Spectator } from "spectator-sdk";

const rec = Spectator.start({
  serverUrl: "ws://localhost:8080/ingest",
  maskInputs: true,       // never record passwords or card numbers
  throttleMouse: 50,      // ms
  flushInterval: 1000,    // ms
  maxBatchSize: 50,       // events
});

// later…
rec.stop();
```

`sdk/demo.html` is a preconfigured demo — open it in a browser and it auto-starts recording.

---

## The Player — Five Pages

| Page | File | What it shows |
|---|---|---|
| **Sessions** | `player/src/SessionList.tsx` | All recordings, sortable by recency, click to replay (or live-watch if active) |
| **Heatmaps** | `player/src/Heatmaps.tsx` | Aggregated click density over a 1280×720 virtual viewport. Pure client-side aggregation from the event stream. |
| **Funnels** | `player/src/Funnels.tsx` | Five hardcoded steps — loaded / moved / clicked / scrolled / engaged (≥3 clicks). Drop-off % between each step. |
| **Events** | `player/src/Events.tsx` | Raw stream, category filter, 500/page pagination, sortable descending by timestamp |
| **Settings** | `player/src/Settings.tsx` | SDK-config builder; settings persist to `localStorage` under `spectator:settings` and can be imported by apps that embed the SDK via the exported `getSettings()` helper |

Navigation lives in `player/src/Sidebar.tsx`. Page routing is a plain `useState<PageId>` in `App.tsx` — no router needed for five pages, and it keeps bundle size small.

---

## Privacy — PII Masking

Two layers of protection:

**1. `maskInputs: true`** — all `<input>` and `<textarea>` values replaced with `•••` before leaving the browser:

```js
Spectator.start({ serverUrl: "…", maskInputs: true });
```

**2. `data-spectator-mask`** — redact text content for any element:

```html
<div data-spectator-mask="true">SSN: 123-45-6789</div>
<!-- replays as: SSN: ••••••••••• -->

<input data-spectator-mask="true" type="text" />
<!-- value attribute replaced with bullets in the snapshot -->
```

---

## How Replay Works

The replay engine is the inverse of the recorder:

1. **Snapshot → iframe** — the initial `SerializedNode` tree is walked recursively to recreate real DOM nodes inside a sandboxed iframe. A `nodeMap` (id → Node) is built alongside.
2. **Mutations → DOM patches** — each `MutationEvent` references nodes by numeric ID. The player looks them up in `nodeMap` and applies the change: `appendChild`, `removeChild`, `setAttribute`, or `textContent =`.
3. **Events → visual overlay** — `mousemove` moves a fake SVG cursor. `click` spawns a ripple. `scroll` calls `contentWindow.scrollTo()`.
4. **Timing** — `requestAnimationFrame` ticks ~16ms. On each tick, all events whose `timestamp - sessionStart <= elapsed * playbackSpeed` are applied in order.

The playback loop uses `useRef` for the event pointer to avoid stale-closure bugs where paused/resumed state would replay from the beginning. See `player/src/ReplayPlayer.tsx`.

---

## Live Spectating

`server/hub.go` maintains `map[sessionID][]chan []RecordingMessage`. When `/ingest` receives a batch, it simultaneously:

1. persists via `Store.SaveEvent`
2. fans out to every subscriber channel for that session

The player connects to `ws://server/watch/{sessionId}` and:

1. First receives all stored events so far (catch-up)
2. Then streams new batches as they arrive — no polling

**Slow-consumer handling:** each subscriber channel is buffered (256). If a watcher falls behind, batches are dropped for *that client only* — the ingest pipeline is never blocked by a laggy browser.

---

## Go Server Concurrency Model

Every WebSocket connection (both `/ingest` and `/watch`) runs in its own goroutine:

- **Goroutine overhead:** ~2 KB stack (vs ~1 MB for an OS thread)
- Go's scheduler multiplexes thousands of goroutines onto a handful of OS threads
- `sync.RWMutex` on `MemoryStore` and `LiveHub` — many concurrent readers, exclusive writers
- At 10 000 concurrent sessions: ~20 MB of goroutine overhead total

The Postgres store reuses three prepared statements (`insert` / `list` / `get`) on a tuned pool (`MaxOpenConns=25`, `MaxIdleConns=5`) — no per-request parse/plan cost.

---

## Testing

```bash
# Unit tests — no external deps, always run in CI
cd server && go test ./...
# → PASS: MemoryStore_RoundTrip, MemoryStore_ConcurrentWrites (100 goroutines), MemoryStore_UnknownSession

# Integration tests — require Postgres
docker compose up -d
DATABASE_URL="postgres://spectator:spectator@localhost:5432/spectator?sslmode=disable" \
  go test -tags integration ./...
```

Integration tests live behind a `//go:build integration` tag so the default `go test ./...` stays green on machines without Docker. Both suites share the same `runStoreRoundTrip(t, Store)` / `runStoreConcurrentWrites(t, Store)` bodies — the `Store` interface is tested identically against memory and Postgres.

---

## Deployment

### Server → Fly.io (live)

The committed [`server/fly.toml`](server/fly.toml) is what's actually deployed at <https://spectator-server.fly.dev>:

```bash
cd server
fly apps create spectator-server
fly deploy --remote-only
# → Two app machines on shared-cpu-1x / 256 MB in `ewr` (Newark, closest to NYC)
```

`fly.toml` pins `auto_stop_machines = false` + `min_machines_running = 1` (WebSockets don't like cold starts) and `force_https = true` so the player connects over `wss://` — [`ReplayPlayer.tsx`](player/src/ReplayPlayer.tsx) derives that from `https://` via `serverUrl.replace(/^http/, "ws")`.

To attach Postgres for persistence, add Neon / Supabase / Fly's own Postgres and:

```bash
fly secrets set DATABASE_URL="postgres://…@host/db?sslmode=require"
fly deploy --remote-only
```

The server falls back to the in-memory store automatically when `DATABASE_URL` is unset, so the demo above is fully working without any database attached.

<details>
<summary>Alternative: Railway</summary>

Railway auto-detects `server/Dockerfile` via the committed [`railway.json`](railway.json):

```bash
railway init spectator
railway add --database postgres                       # injects DATABASE_URL
railway variables set ALLOWED_ORIGINS="https://spectator-player.vercel.app"
railway up
```

The `railway.json` pins `/healthz` as the health check and sets `restartPolicyType: ON_FAILURE`.
</details>

The Dockerfile is a multi-stage Alpine builder → `distroless/static-debian12:nonroot` (~3 MB final image, no shell, no package manager).

### Player → Vercel (live)

Live at <https://spectator-player.vercel.app>, wired to the Fly server:

```bash
cd player
vercel link --project spectator-player
echo "https://spectator-server.fly.dev" | vercel env add VITE_SERVER_URL production
vercel --prod
```

[`vercel.json`](player/vercel.json) handles SPA rewrites and sets `Cache-Control: public, max-age=31536000, immutable` on hashed assets so subsequent loads are served from the edge.

### Postgres → Railway plugin / Neon / Supabase

Any managed Postgres works. The server runs `CREATE TABLE IF NOT EXISTS events (…)` + two indexes on boot, so no migration step is needed. Full schema is in `server/migrations/001_init.sql` if you want to pre-apply.

### Server env vars

| Var               | Default  | Effect                                                                 |
|-------------------|----------|------------------------------------------------------------------------|
| `PORT`            | `8080`   | Listen port. Railway / Fly inject this automatically.                  |
| `DATABASE_URL`    | *(unset)*| Postgres DSN. When unset, the server falls back to the in-memory store.|
| `ALLOWED_ORIGINS` | `*`      | Comma-separated CORS + WebSocket origin allowlist.                     |

---

## Postgres Schema

```sql
CREATE TABLE IF NOT EXISTS events (
  id         BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  type       TEXT NOT NULL,
  data       JSONB NOT NULL,
  timestamp  BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_session    ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, timestamp);
```

`JSONB` stores the polymorphic event payload without rigid columns — `snapshot`, `mutations`, `events` all share one row shape. The compound index supports replay queries (`WHERE session_id = $1 ORDER BY timestamp`) with no sort step.

---

## Seed Data

```bash
cd seed
node seed.js --sessions 12 --url ws://localhost:8080/ingest
```

Generates realistic sessions across 8 user personas (bouncer, browser, engaged, power-user, converter, drop-off, navigator, live). Each persona varies click count, scroll depth, input length, cursor spread, and session age. Clicks are drawn from 7 hotspots (logo, nav-right, hero-cta, cards 1–3, footer-cta) with jitter, so the heatmap shows realistic hotspot clustering instead of uniform noise.

Useful for demoing funnels and heatmaps without manually clicking around 20 times.

---

## Project Layout

```
spectator/
├── sdk/                   # TypeScript recorder SDK
│   ├── src/recorder.ts    # snapshot + MutationObserver
│   ├── src/transport.ts   # WS client + batching + reconnect
│   └── demo.html          # preconfigured demo page
├── server/                # Go WebSocket server
│   ├── main.go            # HTTP routes + store factory
│   ├── handler.go         # /ingest, /watch, REST handlers
│   ├── hub.go             # LiveHub fan-out
│   ├── store.go           # Store interface + MemoryStore
│   ├── postgres.go        # PostgresStore (prepared stmts + JSONB)
│   ├── store_test.go      # unit tests (in-memory)
│   ├── postgres_integration_test.go  # +build integration
│   ├── migrations/001_init.sql
│   ├── Dockerfile
│   └── fly.toml
├── player/                # React replay UI
│   ├── src/App.tsx        # page router + global health poll
│   ├── src/Sidebar.tsx
│   ├── src/SessionList.tsx
│   ├── src/ReplayPlayer.tsx
│   ├── src/Heatmaps.tsx
│   ├── src/Funnels.tsx
│   ├── src/Events.tsx
│   ├── src/Settings.tsx
│   ├── src/theme.ts       # industry-standard dark palette (Linear / PostHog)
│   └── vercel.json
├── seed/seed.js           # realistic-persona session generator
├── docker-compose.yml     # Postgres 16 + auto-applied migrations
├── Makefile               # `make dev` boots the whole stack
├── LICENSE                # MIT
└── README.md
```

---

## Extending

### Binary encoding

Replace `JSON.stringify` in `sdk/src/transport.ts` with MessagePack (`@msgpack/msgpack`). Expected payload reduction: 40–60%. Trade-off: loses human-readability during debugging.

### S3 snapshot cold-storage

Large full-DOM snapshots can push a hot Postgres row to 1 MB+. For production, store `snapshot` payloads on S3 and keep only a pointer in the `events.data` JSONB column. Preserves fast list/get queries and shrinks row size by 10–100×.

### Horizontal scaling

Stateless Go servers behind a load balancer, sticky sessions via Redis pub/sub for live fan-out across nodes. Partition `events` by `session_id` hash. Put Kafka in front of the ingest path for burst tolerance.

---

## Design Notes

**Recording model.** Snapshot the initial DOM once, then stream diffs — same shape as video codecs (I-frames + P-frames), but structured as JSON events. One minute of replay is ~50 KB vs ~15 MB for a screen recording, and every event stays searchable and inspectable inside the player.

**Performance.** Mouse events throttled to 50 ms, WebSocket sends batched on a 1 s / 50-event flush rule, MutationObserver batches natively, prepared statements on every DB path. SDK overhead measures under 1 ms per interaction on a mid-range laptop.

**Live fan-out.** The ingest handler writes to the store and broadcasts to LiveHub subscribers in the same goroutine. Subscriber channels are buffered at 256 — if a watcher falls behind, the batch is dropped for that watcher only, never for the ingest path.

**Privacy.** Two independent knobs: `maskInputs` at the SDK level so typed values never leave the browser, and `data-spectator-mask` on any element to redact its text content and masked-input values inside the snapshot.

**Store abstraction.** `main.go` picks MemoryStore vs PostgresStore from a single `DATABASE_URL` check. Unit tests and integration tests share the same table-driven test bodies, so both implementations are exercised against identical contracts.

**Scaling roadmap.** First bottleneck is snapshot size in Postgres — move `snapshot` payloads to S3 and keep a pointer in JSONB. Next: Kafka in front of ingest so a DB blip doesn't drop events. Then: partition `events` by `session_id` hash for linear write scaling and sticky-session routing for live fan-out across multiple server pods.
