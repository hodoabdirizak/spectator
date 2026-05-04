import React, { useEffect, useState } from "react";
import { D } from "./theme";

interface Session {
  id: string;
  startTime: number;
  eventCount: number;
}

interface SessionListProps {
  serverUrl: string;
  onSelectSession: (sessionId: string, live?: boolean) => void;
  onError: (err: boolean) => void;
}

export const SessionList: React.FC<SessionListProps> = ({ serverUrl, onSelectSession, onError }) => {
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(false);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<"all" | "live" | "saved">("all");

  useEffect(() => {
    const load = () =>
      fetch(`${serverUrl}/sessions`)
        .then(r => r.json())
        .then(data => { setSessions(data || []); setLoading(false); setError(false); onError(false); })
        .catch(() => { setLoading(false); setError(true); onError(true); });
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [serverUrl, onError]);

  const live  = sessions.filter(s => Date.now() - s.startTime < 30_000);
  const filtered = sessions
    .slice()
    .sort((a, b) => b.startTime - a.startTime)
    .filter(s => {
      const age = Date.now() - s.startTime;
      if (filter === "live"  && age >= 30_000) return false;
      if (filter === "saved" && age <  30_000) return false;
      if (search && !s.id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

      {/* Page header */}
      <div style={{
        padding: "28px 32px 22px",
        borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontSize: 11, color: D.textDim, letterSpacing: "0.05em",
            textTransform: "uppercase", marginBottom: 8,
          }}>
            Analytics / Sessions
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: D.text, letterSpacing: "-0.02em", margin: 0 }}>
            Session Recordings
          </h1>
        </div>

        {/* Stat cards */}
        <div style={{ display: "flex", gap: 10, flexShrink: 0, marginTop: 2 }}>
          {[
            { value: sessions.length, label: "Total",  color: D.textMid },
            { value: live.length,     label: "Live",   color: D.green   },
          ].map(stat => (
            <div key={stat.label} style={{
              padding: "10px 18px",
              background: D.card,
              border: `1px solid ${D.border2}`,
              borderRadius: 10,
              textAlign: "center",
              minWidth: 68,
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, lineHeight: 1, letterSpacing: "-0.02em" }}>
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
        padding: "14px 32px",
        borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "center", gap: 10,
        flexShrink: 0,
      }}>
        {/* Search */}
        <div style={{ position: "relative", maxWidth: 300, flex: 1 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
               width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke={D.textDim} strokeWidth="1.3"/>
            <path d="M9 9l2.5 2.5" stroke={D.textDim} strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by session ID…"
            style={{
              width: "100%", padding: "7px 10px 7px 30px",
              background: D.card, border: `1px solid ${D.border2}`,
              borderRadius: 7, color: D.text, fontSize: 13,
              outline: "none", fontFamily: "inherit",
              transition: "border-color 0.15s",
            }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: "flex", gap: 4 }}>
          {(["all", "live", "saved"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "6px 13px",
              border: `1px solid ${filter === f ? D.accent : D.border2}`,
              borderRadius: 6,
              background: filter === f ? D.accentBg : "transparent",
              color: filter === f ? D.accent : D.textMid,
              fontSize: 12, fontWeight: filter === f ? 500 : 400,
              cursor: "pointer", transition: "all 0.12s",
              fontFamily: "inherit",
            }}>
              {f === "all" ? "All" : f === "live" ? "Live" : "Saved"}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: error ? D.red : D.green }} />
          <span style={{ fontSize: 11, color: D.textDim }}>
            {loading ? "Loading…" : "Polling every 3s"}
          </span>
        </div>
      </div>

      {/* Table area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Column headers */}
        {sessions.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "110px minmax(0,1fr) 80px 80px 130px 200px",
            gap: 16, padding: "11px 32px",
            borderBottom: `1px solid ${D.border}`,
            position: "sticky", top: 0, background: D.surface, zIndex: 5,
          }}>
            {["Status", "Session ID", "Events", "Duration", "Started", ""].map(h => (
              <span key={h + "hdr"} style={{
                fontSize: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.08em",
                color: D.textDim,
              }}>
                {h}
              </span>
            ))}
          </div>
        )}

        {/* States */}
        {loading && (
          <div style={{ padding: "52px 32px", color: D.textDim, fontSize: 13 }}>
            Connecting to {serverUrl}…
          </div>
        )}

        {!loading && error && (
          <div style={{ padding: "52px 32px" }}>
            <div style={{ fontSize: 14, color: D.red, fontWeight: 600, marginBottom: 8 }}>Cannot reach server</div>
            <div style={{ fontSize: 13, color: D.textMid, lineHeight: 1.7 }}>
              Start the Go server, then this panel will reconnect automatically.
            </div>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div style={{ padding: "64px 32px" }}>
            <div style={{
              display: "inline-block",
              fontSize: 10, fontWeight: 600, letterSpacing: "0.12em",
              textTransform: "uppercase", color: D.accent,
              padding: "4px 10px", borderRadius: 4,
              background: D.accentBg, border: `1px solid ${D.accent}33`,
              marginBottom: 16,
            }}>
              Try the live demo
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: D.text, marginBottom: 10, letterSpacing: "-0.01em" }}>
              Record a session in 30 seconds
            </div>
            <div style={{ fontSize: 13, color: D.textMid, lineHeight: 1.75, maxWidth: 460, marginBottom: 24 }}>
              No sessions yet. Open the demo store, click around the shopfront,
              fill the checkout — your session streams here in real time, then
              replay it with click heatmaps, funnels, and the full event stream.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 36 }}>
              <a
                href="/demo/"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 18px",
                  background: D.accent, color: "#fff",
                  fontSize: 13, fontWeight: 500,
                  borderRadius: 7, textDecoration: "none",
                  transition: "opacity 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "0.88")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
              >
                Open demo store →
              </a>
              <a
                href="https://github.com/hodoabdirizak/spectator"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "10px 18px",
                  background: "transparent", color: D.textMid,
                  border: `1px solid ${D.border2}`,
                  fontSize: 13, fontWeight: 500,
                  borderRadius: 7, textDecoration: "none",
                  transition: "color 0.15s, border-color 0.15s",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = D.text;
                  e.currentTarget.style.borderColor = D.textMid;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = D.textMid;
                  e.currentTarget.style.borderColor = D.border2;
                }}
              >
                View source on GitHub
              </a>
            </div>

            <div style={{ fontSize: 11, color: D.textDim, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
              Or instrument your own page
            </div>
            <pre style={{
              background: D.card, border: `1px solid ${D.border2}`,
              borderRadius: 8, padding: "16px 20px",
              fontSize: 12, color: D.textMid,
              fontFamily: "'Courier New', monospace", lineHeight: 1.9,
              maxWidth: 460,
            }}>
{`import { Spectator } from "spectator-sdk";

Spectator.start({
  serverUrl: "wss://spectator-server.fly.dev/ingest",
  maskInputs: true,
});`}
            </pre>
          </div>
        )}

        {!loading && sessions.length > 0 && filtered.length === 0 && (
          <div style={{ padding: "40px 32px", color: D.textDim, fontSize: 13 }}>
            No sessions match the current filter.
          </div>
        )}

        {filtered.map((s, i) => (
          <SessionRow
            key={s.id}
            session={s}
            isLast={i === filtered.length - 1}
            onReplay={() => onSelectSession(s.id, false)}
            onWatchLive={() => onSelectSession(s.id, true)}
          />
        ))}
      </div>

      {/* Footer bar */}
      <div style={{
        padding: "10px 32px",
        borderTop: `1px solid ${D.border}`,
        display: "flex", alignItems: "center",
        fontSize: 11, color: D.textDim,
        flexShrink: 0,
      }}>
        {sessions.length > 0
          ? `Showing ${filtered.length} of ${sessions.length} session${sessions.length === 1 ? "" : "s"}`
          : "No sessions"
        }
      </div>
    </div>
  );
};

/* ── Row ── */
function SessionRow({ session, isLast, onReplay, onWatchLive }: {
  session: Session;
  isLast: boolean;
  onReplay: () => void;
  onWatchLive: () => void;
}) {
  const [hov, setHov] = useState(false);
  const age    = Date.now() - session.startTime;
  const isLive = age < 30_000;

  const ageStr = age < 60_000
    ? `${Math.floor(age / 1000)}s ago`
    : age < 3_600_000
    ? `${Math.floor(age / 60_000)}m ago`
    : new Date(session.startTime).toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "110px minmax(0,1fr) 80px 80px 130px 200px",
        gap: 16, padding: "13px 32px",
        alignItems: "center",
        borderBottom: isLast ? "none" : `1px solid ${D.border}`,
        background: hov ? D.card : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* Status badge */}
      <div>
        {isLive ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 4,
            background: D.greenBg, border: "1px solid rgba(34,197,94,0.32)",
            color: D.green, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: D.green, display: "inline-block",
              animation: "pulse 1.4s ease-in-out infinite",
            }} />
            LIVE
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "3px 9px", borderRadius: 4,
            background: "rgba(155,163,175,0.10)", border: "1px solid rgba(155,163,175,0.22)",
            color: D.textDim, fontSize: 10, fontWeight: 700, letterSpacing: "0.07em",
          }}>
            SAVED
          </span>
        )}
      </div>

      {/* Session ID */}
      <span style={{
        fontFamily: "'Courier New', monospace",
        fontSize: 12, color: D.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {session.id}
      </span>

      {/* Events */}
      <span style={{ fontSize: 13, color: D.textMid, fontVariantNumeric: "tabular-nums" }}>
        {session.eventCount.toLocaleString()}
      </span>

      {/* Duration */}
      <span style={{ fontSize: 12, color: D.textDim }}>—</span>

      {/* Age */}
      <span style={{ fontSize: 12, color: D.textDim }}>{ageStr}</span>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        {isLive && <Btn label="Watch Live" accent={D.green}  onClick={onWatchLive} />}
        <Btn label="Replay" accent={D.accent} onClick={onReplay} />
      </div>
    </div>
  );
}

function Btn({ label, accent, onClick }: { label: string; accent: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "5px 13px",
        border: `1px solid ${hov ? accent : D.border2}`,
        borderRadius: 5,
        background: hov ? `${accent}18` : "transparent",
        color: hov ? accent : D.textMid,
        fontSize: 12, fontWeight: 500,
        cursor: "pointer", transition: "all 0.12s",
        fontFamily: "inherit", whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default SessionList;
