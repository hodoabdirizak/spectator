// =============================================================
// Events — raw event stream across sessions
// =============================================================
// Pulls every session's RecordingMessage[] and flattens them into a
// single time-ordered stream with filter chips by type. This is the
// "tail -f" view of your analytics — useful for debugging the SDK
// and verifying event shape.
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

interface StreamItem {
  id: string;           // unique key
  sessionId: string;
  timestamp: number;
  category: "snapshot" | "mutation" | "click" | "mousemove" | "scroll" | "input" | "resize" | "other";
  label: string;
  detail: string;
}

const CATEGORIES = ["all", "click", "mousemove", "scroll", "input", "mutation", "snapshot"] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_COLOR: Record<StreamItem["category"], string> = {
  snapshot:  D.accent,
  mutation:  D.purple,
  click:     D.green,
  mousemove: D.textMid,
  scroll:    D.amber,
  input:     D.red,
  resize:    D.textMid,
  other:     D.textDim,
};

interface EventsProps {
  serverUrl: string;
}

export const Events: React.FC<EventsProps> = ({ serverUrl }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [items, setItems]       = useState<StreamItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<Category>("all");
  const [search, setSearch]     = useState("");
  const [limit, setLimit]       = useState(500);

  useEffect(() => {
    fetch(`${serverUrl}/sessions`)
      .then(r => r.json())
      .then((data: Session[]) => setSessions(data || []))
      .catch(() => setError("Cannot reach server"));
  }, [serverUrl]);

  useEffect(() => {
    if (sessions.length === 0) { setLoading(false); return; }
    setLoading(true);
    // Pull the 15 most recent sessions to keep the stream snappy
    const recent = sessions
      .slice()
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 15);

    Promise.all(recent.map(s =>
      fetch(`${serverUrl}/sessions/${s.id}`)
        .then(r => r.json() as Promise<RecordingMessage[]>)
        .catch(() => [] as RecordingMessage[])
    )).then(results => {
      const flat: StreamItem[] = [];
      for (const msgs of results) {
        for (const msg of msgs) {
          flat.push(...expand(msg));
        }
      }
      flat.sort((a, b) => b.timestamp - a.timestamp);
      setItems(flat);
      setLoading(false);
    });
  }, [sessions, serverUrl]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(it => filter === "all" || it.category === filter)
      .filter(it => !q || it.sessionId.toLowerCase().includes(q) || it.label.toLowerCase().includes(q) || it.detail.toLowerCase().includes(q))
      .slice(0, limit);
  }, [items, filter, search, limit]);

  const countsByCategory = useMemo(() => {
    const c: Record<string, number> = {};
    for (const it of items) c[it.category] = (c[it.category] || 0) + 1;
    return c;
  }, [items]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "28px 32px 22px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, color: D.textDim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            Analytics / Events
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: D.text, letterSpacing: "-0.02em", margin: 0 }}>
            Event Stream
          </h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
          {[
            { value: items.length,       label: "Events",  color: D.textMid },
            { value: filtered.length,    label: "Shown",   color: D.accent },
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

      {/* Filter bar */}
      <div style={{
        padding: "14px 32px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", maxWidth: 280, flex: 1, minWidth: 180 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
               width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke={D.textDim} strokeWidth="1.3"/>
            <path d="M9 9l2.5 2.5" stroke={D.textDim} strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search events…"
            style={{
              width: "100%", padding: "7px 10px 7px 30px",
              background: D.card, border: `1px solid ${D.border2}`,
              borderRadius: 7, color: D.text, fontSize: 13,
              outline: "none", fontFamily: "inherit",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {CATEGORIES.map(cat => (
            <button key={cat} onClick={() => setFilter(cat)} style={{
              padding: "6px 12px",
              border: `1px solid ${filter === cat ? D.accent : D.border2}`,
              borderRadius: 6,
              background: filter === cat ? D.accentBg : "transparent",
              color: filter === cat ? D.accent : D.textMid,
              fontSize: 12, fontWeight: filter === cat ? 500 : 400,
              cursor: "pointer", fontFamily: "inherit",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}>
              <span>{cat}</span>
              {cat !== "all" && countsByCategory[cat] != null && (
                <span style={{ fontSize: 10, color: D.textDim, fontVariantNumeric: "tabular-nums" }}>
                  {countsByCategory[cat]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {error && (
          <div style={{ padding: "40px 32px", color: D.red, fontWeight: 600 }}>{error}</div>
        )}
        {!error && loading && (
          <div style={{ padding: "40px 32px", color: D.textDim, fontSize: 13 }}>Loading events…</div>
        )}
        {!error && !loading && items.length === 0 && (
          <div style={{ padding: "64px 32px", color: D.textMid, fontSize: 13 }}>
            No events yet. Record a session to populate this view.
          </div>
        )}
        {!error && !loading && items.length > 0 && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "120px 100px minmax(0,1fr) 180px",
              gap: 16, padding: "11px 32px",
              borderBottom: `1px solid ${D.border}`,
              position: "sticky", top: 0, background: D.surface, zIndex: 5,
            }}>
              {["Time", "Type", "Detail", "Session"].map(h => (
                <span key={h} style={{
                  fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.08em", color: D.textDim,
                }}>
                  {h}
                </span>
              ))}
            </div>
            {filtered.map(it => <EventRow key={it.id} item={it} />)}
            {items.length > limit && filtered.length === limit && (
              <div style={{
                padding: "16px 32px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderTop: `1px solid ${D.border}`, fontSize: 12, color: D.textDim,
              }}>
                <span>Showing {limit.toLocaleString()} of {items.length.toLocaleString()}</span>
                <button onClick={() => setLimit(l => l + 500)} style={{
                  padding: "6px 14px", border: `1px solid ${D.border2}`, borderRadius: 6,
                  background: "transparent", color: D.textMid, fontSize: 12,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  Load 500 more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

function EventRow({ item }: { item: StreamItem }) {
  const [hov, setHov] = useState(false);
  const color = CATEGORY_COLOR[item.category];
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "120px 100px minmax(0,1fr) 180px",
        gap: 16, padding: "11px 32px", alignItems: "center",
        borderBottom: `1px solid ${D.border}`,
        background: hov ? D.card : "transparent",
        transition: "background 0.1s",
      }}
    >
      <span style={{
        fontFamily: "'Courier New', monospace",
        fontSize: 11, color: D.textDim,
      }}>
        {new Date(item.timestamp).toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
        })}
        .{String(item.timestamp % 1000).padStart(3, "0")}
      </span>

      <span style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 11, color, fontWeight: 600, textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: color,
        }}/>
        {item.label}
      </span>

      <span style={{
        fontSize: 12, color: D.textMid,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontFamily: "'Courier New', monospace",
      }}>
        {item.detail}
      </span>

      <span style={{
        fontFamily: "'Courier New', monospace",
        fontSize: 11, color: D.textDim,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.sessionId}
      </span>
    </div>
  );
}

// Fan out a RecordingMessage into one-or-more StreamItems for display.
function expand(msg: RecordingMessage): StreamItem[] {
  const base = `${msg.sessionId}-${msg.timestamp}`;
  if (msg.type === "snapshot") {
    return [{
      id: `${base}-snap`,
      sessionId: msg.sessionId,
      timestamp: msg.timestamp,
      category: "snapshot",
      label: "snapshot",
      detail: `Full DOM snapshot captured`,
    }];
  }
  if (msg.type === "mutations") {
    const muts = (msg.data as unknown[]) || [];
    return [{
      id: `${base}-mut`,
      sessionId: msg.sessionId,
      timestamp: msg.timestamp,
      category: "mutation",
      label: "mutation",
      detail: `${muts.length} DOM mutation${muts.length === 1 ? "" : "s"}`,
    }];
  }
  if (msg.type === "events") {
    const evs = (msg.data as Array<{ type: string; x?: number; y?: number; timestamp?: number }>) || [];
    return evs.map((ev, i) => ({
      id: `${base}-ev-${i}`,
      sessionId: msg.sessionId,
      timestamp: ev.timestamp ?? msg.timestamp,
      category: normalizeCategory(ev.type),
      label: ev.type,
      detail: formatEvent(ev),
    }));
  }
  return [{
    id: `${base}-other`,
    sessionId: msg.sessionId,
    timestamp: msg.timestamp,
    category: "other",
    label: msg.type,
    detail: "",
  }];
}

function normalizeCategory(type: string): StreamItem["category"] {
  if (type === "click" || type === "mousemove" || type === "scroll" || type === "input" || type === "resize") return type;
  return "other";
}

function formatEvent(ev: { type: string; x?: number; y?: number; [k: string]: unknown }): string {
  if (ev.type === "click")     return `click at (${ev.x}, ${ev.y})`;
  if (ev.type === "mousemove") return `move to (${ev.x}, ${ev.y})`;
  if (ev.type === "scroll")    return `scroll to (${ev.x}, ${ev.y})`;
  if (ev.type === "input")     return `input changed`;
  if (ev.type === "resize")    return `resize to ${ev.width ?? "?"}×${ev.height ?? "?"}`;
  return JSON.stringify(ev);
}

export default Events;
