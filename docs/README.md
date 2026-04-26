# Screenshots & demo assets

The PNGs in this directory are referenced by the top-level [`README.md`](../README.md). They are generated automatically — don't edit them by hand.

| File              | Page                                              |
|-------------------|---------------------------------------------------|
| `sessions.png`    | Session list (live + saved badges, filters, search) |
| `replay.png`      | Replay engine playing a real recorded session     |
| `heatmaps.png`    | Aggregated click heatmap with gaussian-kernel density |
| `funnels.png`     | Five-step engagement funnel with per-step drop-off |
| `events.png`      | Raw event stream with type filters                |
| `demo-store.png`  | The Atelier demo store the SDK records against    |

## Regenerating

```bash
# 1. Boot the stack
make dev          # in one terminal: server :8080, demo :4321, player :5173
make seed         # in another: 12 realistic personas

# 2. One-time tooling
cd scripts && npm install && npx playwright install chromium

# 3. Capture every page
node capture-screenshots.mjs
# → writes sessions.png, replay.png, heatmaps.png, funnels.png, events.png, demo-store.png
```

The capture script first drives the demo store with Playwright (scrolls, clicks three product cards, fills the name + email fields) so the resulting session is rich enough to look interesting in the replay screenshot. It then locates that exact session row in the player and clicks its **Replay** button before screenshotting — no luck involved in which session ends up on the cover.

Override URLs via env vars if your stack runs on different ports:

```bash
PLAYER_URL=http://localhost:5173 \
DEMO_URL=http://localhost:4321/demo.html?server=http://localhost:8080 \
SERVER_URL=http://localhost:8080 \
node capture-screenshots.mjs
```
