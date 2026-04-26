// =============================================================
// Heatmaps — click density across all recorded sessions
// =============================================================
// Fetches the session list, pulls each session's events, extracts
// clicks, and bins their (x,y) coords into a 2D grid that we render
// as a radial-gradient overlay. This is a smaller-scale version of
// what PostHog / Hotjar ship — the algorithm is identical: count
// events per cell, normalize to a max, paint warm→hot.
// =============================================================

import React, { useEffect, useMemo, useState } from "react";
import { D } from "./theme";

interface Session {
  id: string;
  startTime: number;
  eventCount: number;
}

interface RecordingMessage {
  type: string;
  data: unknown;
  timestamp: number;
  sessionId: string;
}

interface ClickPoint { x: number; y: number; sessionId: string; }

interface HeatmapsProps {
  serverUrl: string;
}

// Virtual viewport we bin into. Real clicks outside this area get clipped.
const VP_W = 1280;
const VP_H = 720;
const CELL = 32; // px per bin

export const Heatmaps: React.FC<HeatmapsProps> = ({ serverUrl }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clicks,   setClicks]   = useState<ClickPoint[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [maxSessions, setMaxSessions] = useState(10);

  // Load sessions once
  useEffect(() => {
    fetch(`${serverUrl}/sessions`)
      .then(r => r.json())
      .then((data: Session[]) => setSessions(data || []))
      .catch(() => setError("Cannot reach server"));
  }, [serverUrl]);

  // When sessions arrive, fetch events for the N most recent and pull out clicks
  useEffect(() => {
    if (sessions.length === 0) { setLoading(false); return; }
    setLoading(true);

    const recent = sessions
      .slice()
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, maxSessions);

    Promise.all(recent.map(s =>
      fetch(`${serverUrl}/sessions/${s.id}`)
        .then(r => r.json() as Promise<RecordingMessage[]>)
        .then(msgs => ({ id: s.id, msgs }))
        .catch(() => ({ id: s.id, msgs: [] as RecordingMessage[] }))
    )).then(results => {
      const all: ClickPoint[] = [];
      for (const { id, msgs } of results) {
        for (const msg of msgs) {
          if (msg.type !== "events") continue;
          const evs = msg.data as Array<{ type: string; x?: number; y?: number }>;
          for (const ev of evs || []) {
            if (ev.type === "click" && typeof ev.x === "number" && typeof ev.y === "number") {
              all.push({ x: ev.x, y: ev.y, sessionId: id });
            }
          }
        }
      }
      setClicks(all);
      setLoading(false);
    });
  }, [sessions, serverUrl, maxSessions]);

  // Bin clicks into a grid, find max density for normalization
  const { grid, maxDensity, visibleClicks } = useMemo(() => {
    const cols = Math.ceil(VP_W / CELL);
    const rows = Math.ceil(VP_H / CELL);
    const g = new Float32Array(cols * rows);
    let max = 0;
    let visible = 0;
    for (const c of clicks) {
      if (c.x < 0 || c.x >= VP_W || c.y < 0 || c.y >= VP_H) continue;
      visible++;
      const cx = Math.floor(c.x / CELL);
      const cy = Math.floor(c.y / CELL);
      // Add a soft gaussian around the cell for a smoother heatmap
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const w = dx === 0 && dy === 0 ? 1.0 : (Math.abs(dx) + Math.abs(dy) === 1 ? 0.55 : 0.28);
        g[ny * cols + nx] += w;
      }
    }
    for (let i = 0; i < g.length; i++) if (g[i] > max) max = g[i];
    return { grid: g, maxDensity: max, visibleClicks: visible };
  }, [clicks]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "28px 32px 22px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, color: D.textDim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            Analytics / Heatmaps
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: D.text, letterSpacing: "-0.02em", margin: 0 }}>
            Click Heatmap
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { value: clicks.length,      label: "Clicks",      color: D.accent },
            { value: visibleClicks,      label: "In-View",     color: D.purple },
            { value: Math.min(sessions.length, maxSessions), label: "Sessions", color: D.textMid },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: "10px 18px", background: D.card, border: `1px solid ${D.border2}`,
              borderRadius: 10, textAlign: "center", minWidth: 68,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
                {stat.value}
              </div>
              <div style={{ fontSize: 10, color: D.textDim, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Controls bar */}
      <div style={{
        padding: "14px 32px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: D.textMid }}>Aggregate across</span>
        {[5, 10, 25, 50].map(n => (
          <button key={n} onClick={() => setMaxSessions(n)} style={{
            padding: "5px 12px",
            border: `1px solid ${maxSessions === n ? D.accent : D.border2}`,
            borderRadius: 6,
            background: maxSessions === n ? D.accentBg : "transparent",
            color: maxSessions === n ? D.accent : D.textMid,
            fontSize: 12, fontWeight: maxSessions === n ? 500 : 400,
            cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s",
          }}>
            {n} sessions
          </button>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: D.textDim }}>
          {loading ? "Computing…" : `${visibleClicks} clicks in ${VP_W}×${VP_H} viewport`}
        </div>
      </div>

      {/* Heatmap canvas */}
      <div style={{ flex: 1, overflow: "auto", padding: 32, background: D.bg }}>
        {error && (
          <div style={{ fontSize: 14, color: D.red, fontWeight: 600 }}>{error}</div>
        )}
        {!error && !loading && clicks.length === 0 && (
          <div style={{ padding: "64px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginBottom: 8 }}>
              No clicks recorded yet
            </div>
            <div style={{ fontSize: 13, color: D.textMid, lineHeight: 1.75, maxWidth: 420 }}>
              Heatmaps aggregate click events across the most recent sessions. Record a session with clicks to see density here.
            </div>
          </div>
        )}
        {!error && clicks.length > 0 && (
          <HeatmapCanvas grid={grid} maxDensity={maxDensity} />
        )}
      </div>
    </div>
  );
};

function HeatmapCanvas({ grid, maxDensity }: { grid: Float32Array; maxDensity: number }) {
  const cols = Math.ceil(VP_W / CELL);
  const rows = Math.ceil(VP_H / CELL);

  return (
    <div style={{
      position: "relative",
      width: VP_W, height: VP_H,
      maxWidth: "100%",
      aspectRatio: `${VP_W} / ${VP_H}`,
      background: D.card,
      border: `1px solid ${D.border2}`,
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
    }}>
      {/* Mock viewport grid lines */}
      <svg width="100%" height="100%" viewBox={`0 0 ${VP_W} ${VP_H}`}
           style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke={D.border2} strokeWidth="1" opacity="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>

        {/* Heatmap cells */}
        {Array.from({ length: rows }).flatMap((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const v = grid[r * cols + c];
            if (v <= 0) return null;
            const t = Math.min(1, v / maxDensity);
            return (
              <circle
                key={`${r}-${c}`}
                cx={c * CELL + CELL / 2}
                cy={r * CELL + CELL / 2}
                r={CELL * 0.9}
                fill={heatColor(t)}
                opacity={0.45 + t * 0.40}
                style={{ mixBlendMode: "multiply" }}
              />
            );
          })
        )}
      </svg>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 12, right: 12,
        background: "rgba(27,31,39,0.92)",
        border: `1px solid ${D.border2}`,
        borderRadius: 6,
        padding: "8px 10px",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10, color: D.textMid,
        backdropFilter: "blur(6px)",
      }}>
        <span>Low</span>
        <div style={{
          width: 120, height: 8, borderRadius: 4,
          background: "linear-gradient(90deg, #FEF3C7 0%, #FCD34D 30%, #F97316 65%, #DC2626 90%, #7F1D1D 100%)",
        }}/>
        <span>High</span>
      </div>
    </div>
  );
}

// Pure warm heatmap ramp: pale cream → amber → orange → red → maroon.
function heatColor(t: number): string {
  if (t < 0.25) {
    // cream → amber  (#FEF3C7 → #FCD34D)
    const k = t / 0.25;
    return `rgb(${Math.round(254 - k * 2)}, ${Math.round(243 - k * 32)}, ${Math.round(199 - k * 122)})`;
  }
  if (t < 0.5) {
    // amber → orange (#FCD34D → #F97316)
    const k = (t - 0.25) / 0.25;
    return `rgb(${Math.round(252 - k * 3)}, ${Math.round(211 - k * 96)}, ${Math.round(77 - k * 55)})`;
  }
  if (t < 0.75) {
    // orange → red (#F97316 → #DC2626)
    const k = (t - 0.5) / 0.25;
    return `rgb(${Math.round(249 - k * 29)}, ${Math.round(115 - k * 77)}, ${Math.round(22 + k * 16)})`;
  }
  // red → maroon (#DC2626 → #7F1D1D)
  const k = (t - 0.75) / 0.25;
  return `rgb(${Math.round(220 - k * 93)}, ${Math.round(38 - k * 9)}, ${Math.round(38 - k * 9)})`;
}

export default Heatmaps;
