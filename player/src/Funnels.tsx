// =============================================================
// Funnels — conversion drop-off across recorded sessions
// =============================================================
// Defines a 5-step engagement funnel and reports the percentage of
// sessions that reach each step. Real funnel tools (Amplitude,
// PostHog, Mixpanel) work the same way — they just let you define
// the steps via a UI. Here the steps are hard-coded to what we
// capture: session start → mouse movement → click → scroll →
// sustained engagement (≥3 clicks).
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

interface SessionSummary {
  id: string;
  hasMouse: boolean;
  clicks: number;
  hasScroll: boolean;
}

interface FunnelsProps {
  serverUrl: string;
}

const STEPS = [
  { key: "loaded",   label: "Session started",           desc: "SDK initialized and first snapshot captured" },
  { key: "moved",    label: "Mouse moved",               desc: "User interacted with the page" },
  { key: "clicked",  label: "Clicked",                   desc: "At least one click recorded" },
  { key: "scrolled", label: "Scrolled",                  desc: "User explored below the fold" },
  { key: "engaged",  label: "Engaged (3+ clicks)",       desc: "Multiple interactions = qualified session" },
] as const;

type StepKey = typeof STEPS[number]["key"];

export const Funnels: React.FC<FunnelsProps> = ({ serverUrl }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [summaries, setSummaries] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${serverUrl}/sessions`)
      .then(r => r.json())
      .then((data: Session[]) => setSessions(data || []))
      .catch(() => setError("Cannot reach server"));
  }, [serverUrl]);

  useEffect(() => {
    if (sessions.length === 0) { setLoading(false); return; }
    setLoading(true);
    Promise.all(sessions.map(s =>
      fetch(`${serverUrl}/sessions/${s.id}`)
        .then(r => r.json() as Promise<RecordingMessage[]>)
        .then(msgs => summarize(s.id, msgs))
        .catch(() => ({ id: s.id, hasMouse: false, clicks: 0, hasScroll: false }))
    )).then(results => {
      setSummaries(results);
      setLoading(false);
    });
  }, [sessions, serverUrl]);

  // Count how many sessions reached each step
  const counts = useMemo(() => {
    const c: Record<StepKey, number> = { loaded: 0, moved: 0, clicked: 0, scrolled: 0, engaged: 0 };
    for (const s of summaries) {
      c.loaded++;
      if (s.hasMouse) c.moved++;
      if (s.clicks >= 1) c.clicked++;
      if (s.hasScroll) c.scrolled++;
      if (s.clicks >= 3) c.engaged++;
    }
    return c;
  }, [summaries]);

  const total = counts.loaded || 1;
  const stepRows = STEPS.map((step, i) => {
    const count = counts[step.key];
    const pct   = count / total * 100;
    const prev  = i === 0 ? count : counts[STEPS[i - 1].key];
    const drop  = prev - count;
    const dropPct = prev === 0 ? 0 : (drop / prev) * 100;
    return { ...step, count, pct, drop, dropPct };
  });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "28px 32px 22px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, color: D.textDim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            Analytics / Funnels
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: D.text, letterSpacing: "-0.02em", margin: 0 }}>
            Engagement Funnel
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { value: sessions.length,    label: "Total",    color: D.textMid },
            { value: counts.engaged,     label: "Engaged",  color: D.accent  },
            { value: `${((counts.engaged / total) * 100).toFixed(0)}%`, label: "Conv.", color: D.green },
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

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        {error && (
          <div style={{ fontSize: 14, color: D.red, fontWeight: 600 }}>{error}</div>
        )}
        {!error && loading && (
          <div style={{ padding: "40px 0", color: D.textDim, fontSize: 13 }}>Computing funnel…</div>
        )}
        {!error && !loading && sessions.length === 0 && (
          <div style={{ padding: "64px 0" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: D.text, marginBottom: 8 }}>
              No sessions to analyze
            </div>
            <div style={{ fontSize: 13, color: D.textMid, lineHeight: 1.75, maxWidth: 420 }}>
              Record a session with the SDK and a funnel will appear here automatically.
            </div>
          </div>
        )}
        {!error && !loading && sessions.length > 0 && (
          <div style={{ maxWidth: 780, display: "flex", flexDirection: "column", gap: 10 }}>
            {stepRows.map((row, i) => (
              <FunnelBar
                key={row.key}
                index={i}
                label={row.label}
                desc={row.desc}
                count={row.count}
                pct={row.pct}
                drop={row.drop}
                dropPct={row.dropPct}
                isLast={i === stepRows.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function FunnelBar({
  index, label, desc, count, pct, drop, dropPct, isLast,
}: {
  index: number; label: string; desc: string;
  count: number; pct: number; drop: number; dropPct: number; isLast: boolean;
}) {
  return (
    <>
      <div style={{
        background: D.card, border: `1px solid ${D.border2}`, borderRadius: 10,
        padding: "16px 20px", position: "relative", overflow: "hidden",
      }}>
        {/* Fill bar */}
        <div style={{
          position: "absolute", inset: 0,
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${D.accentBg} 0%, rgba(79,142,255,0.03) 100%)`,
          pointerEvents: "none",
        }}/>

        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: D.accentBg, border: `1px solid ${D.accent}`,
            color: D.accent, fontWeight: 700, fontSize: 13,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, fontVariantNumeric: "tabular-nums",
          }}>
            {index + 1}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: D.text, marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 12, color: D.textMid }}>
              {desc}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: D.text, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
              {count}
            </div>
            <div style={{ fontSize: 11, color: D.textDim, marginTop: 4 }}>
              {pct.toFixed(1)}% of start
            </div>
          </div>
        </div>
      </div>

      {!isLast && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "0 20px", marginLeft: 16,
        }}>
          <div style={{ width: 1, height: 14, background: D.border2 }}/>
          <div style={{
            fontSize: 11,
            color: dropPct > 50 ? D.red : dropPct > 25 ? D.amber : D.textMid,
            fontVariantNumeric: "tabular-nums",
          }}>
            {drop === 0 ? "No drop-off" : `−${drop} (${dropPct.toFixed(1)}% drop)`}
          </div>
        </div>
      )}
    </>
  );
}

// Scan a session's events and flag which engagement steps it reached.
function summarize(id: string, msgs: RecordingMessage[]): SessionSummary {
  let hasMouse = false;
  let hasScroll = false;
  let clicks = 0;
  for (const msg of msgs) {
    if (msg.type !== "events") continue;
    const evs = msg.data as Array<{ type: string }>;
    for (const ev of evs || []) {
      if (ev.type === "mousemove") hasMouse = true;
      else if (ev.type === "click") { clicks++; hasMouse = true; }
      else if (ev.type === "scroll") hasScroll = true;
    }
  }
  return { id, hasMouse, clicks, hasScroll };
}

export default Funnels;
