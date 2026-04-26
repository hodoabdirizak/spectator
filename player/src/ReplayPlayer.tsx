import React, { useRef, useEffect, useState, useCallback } from "react";
import { D } from "./theme";

interface SerializedNode {
  id: number;
  type: number;
  tagName?: string;
  attributes?: Record<string, string>;
  textContent?: string;
  children?: SerializedNode[];
}

interface RecordingMessage {
  type: "snapshot" | "mutations" | "events";
  data: any;
  pageUrl?: string;
  viewport?: { width: number; height: number };
  timestamp: number;
  sessionId: string;
}

interface ReplayPlayerProps {
  sessionId: string;
  serverUrl: string;
  live?: boolean;
  onBack?: () => void;
}

export const ReplayPlayer: React.FC<ReplayPlayerProps> = ({
  sessionId, serverUrl, live = false, onBack,
}) => {
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const cursorRef  = useRef<HTMLDivElement>(null);

  const [events,        setEvents]        = useState<RecordingMessage[]>([]);
  const [isPlaying,     setIsPlaying]     = useState(false);
  const [currentTime,   setCurrentTime]   = useState(0);
  const [duration,      setDuration]      = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [status,        setStatus]        = useState<"loading" | "ready" | "live" | "error">("loading");
  const [liveCount,     setLiveCount]     = useState(0);
  const [pageUrl,       setPageUrl]       = useState<string | null>(null);

  const nodeMap = useRef<Map<number, Node>>(new Map());

  /* ── DOM reconstruction ────────────────────────────────────────────── */

  const rebuildNode = useCallback((s: SerializedNode, doc: Document): Node | null => {
    if (s.type === 1) {
      const tag = (s.tagName || "div").toLowerCase();
      // Skip script / noscript even on rebuild — recorded scripts must never run
      if (tag === "script" || tag === "noscript") return null;
      const el = doc.createElement(tag);
      if (s.attributes) {
        for (const [k, v] of Object.entries(s.attributes)) {
          try { el.setAttribute(k, v); } catch (_) { /* ignore invalid attrs */ }
        }
      }
      nodeMap.current.set(s.id, el);
      s.children?.forEach(c => { const n = rebuildNode(c, doc); if (n) el.appendChild(n); });
      return el;
    }
    if (s.type === 3) {
      const t = doc.createTextNode(s.textContent || "");
      nodeMap.current.set(s.id, t);
      return t;
    }
    if (s.type === 8) {
      const c = doc.createComment(s.textContent || "");
      nodeMap.current.set(s.id, c);
      return c;
    }
    return null;
  }, []);

  /**
   * Apply a full snapshot to the iframe document. Rather than replacing
   * the documentElement (which can leave stylesheets in a half-attached
   * state), we wipe head/body in-place and move the rebuilt children
   * across. We also inject a <base href="…"> so relative URLs from the
   * recorded page resolve against the original origin instead of the
   * player's own.
   */
  const applySnapshot = useCallback((snapshot: SerializedNode, baseUrl: string | null) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    // Reset to a known-empty document
    doc.open();
    doc.write("<!DOCTYPE html><html><head></head><body></body></html>");
    doc.close();
    nodeMap.current.clear();

    // Rebuild snapshot tree off-document, then move into the live doc
    const rebuilt = rebuildNode(snapshot, doc) as HTMLElement | null;
    if (!rebuilt) return;

    // Copy <html> attributes (lang, class, etc.)
    if (rebuilt.attributes) {
      for (const a of Array.from(rebuilt.attributes)) {
        try { doc.documentElement.setAttribute(a.name, a.value); } catch (_) {}
      }
    }

    const newHead = rebuilt.querySelector("head");
    const newBody = rebuilt.querySelector("body");

    // Repopulate <head> — base tag first so subsequent <link>/<img> resolve
    if (doc.head) {
      while (doc.head.firstChild) doc.head.removeChild(doc.head.firstChild);
      if (baseUrl) {
        const base = doc.createElement("base");
        base.setAttribute("href", baseUrl);
        doc.head.appendChild(base);
      }
      if (newHead) {
        while (newHead.firstChild) doc.head.appendChild(newHead.firstChild);
      }
    }

    // Repopulate <body>
    if (doc.body && newBody) {
      // copy body attrs
      for (const a of Array.from(newBody.attributes || [])) {
        try { doc.body.setAttribute(a.name, a.value); } catch (_) {}
      }
      while (doc.body.firstChild) doc.body.removeChild(doc.body.firstChild);
      while (newBody.firstChild) doc.body.appendChild(newBody.firstChild);
    }

    // Force re-parse of <style> and <link rel=stylesheet>: some browsers
    // (notably WebKit) don't re-evaluate stylesheets when a node is
    // moved between documents. Cloning + replacing makes them fresh
    // children that the parser definitely sees.
    if (doc.head) {
      doc.head.querySelectorAll("style, link[rel=stylesheet], link[as=style]").forEach((el) => {
        const clone = el.cloneNode(true) as Element;
        el.parentNode?.replaceChild(clone, el);
      });
    }
  }, [rebuildNode]);

  const applyMutation = useCallback((mutation: any) => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    if (mutation.type === "childList") {
      const parent = nodeMap.current.get(mutation.parentId);
      if (!parent) return;
      for (const id of mutation.removeIds) {
        const n = nodeMap.current.get(id);
        if (n?.parentNode) n.parentNode.removeChild(n);
      }
      for (const add of mutation.adds) {
        const n = rebuildNode(add.node, doc);
        if (!n) continue;
        const sib = add.nextSiblingId ? nodeMap.current.get(add.nextSiblingId) : null;
        sib && sib.parentNode === parent
          ? parent.insertBefore(n, sib)
          : parent.appendChild(n);
      }
    } else if (mutation.type === "attributes") {
      const el = nodeMap.current.get(mutation.targetId) as Element;
      if (!el) return;
      mutation.value === null
        ? el.removeAttribute(mutation.name)
        : el.setAttribute(mutation.name, mutation.value);
    } else if (mutation.type === "characterData") {
      const n = nodeMap.current.get(mutation.targetId);
      if (n) n.textContent = mutation.value;
    }
  }, [rebuildNode]);

  const applyUserEvent = useCallback((event: any) => {
    if (event.type === "mousemove" && cursorRef.current) {
      cursorRef.current.style.left = `${event.x}px`;
      cursorRef.current.style.top  = `${event.y}px`;
    } else if (event.type === "click") {
      const ripple = document.createElement("div");
      ripple.style.cssText = `
        position:absolute;left:${event.x - 14}px;top:${event.y - 14}px;
        width:28px;height:28px;border-radius:50%;pointer-events:none;z-index:9998;
        border:1.5px solid ${D.accent};animation:s-ripple 0.6s ease-out forwards;
      `;
      iframeRef.current?.parentElement?.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    } else if (event.type === "scroll") {
      iframeRef.current?.contentWindow?.scrollTo(event.x, event.y);
    }
  }, []);

  /* ── Data loading ──────────────────────────────────────────────────── */

  useEffect(() => {
    if (live) {
      setStatus("live");
      const ws = new WebSocket(serverUrl.replace(/^http/, "ws") + `/watch/${sessionId}`);
      ws.onmessage = (e) => {
        const batch: RecordingMessage[] = JSON.parse(e.data);
        setLiveCount(c => c + batch.length);
        batch.forEach(msg => {
          if (msg.type === "snapshot") {
            setPageUrl(msg.pageUrl ?? null);
            applySnapshot(msg.data, msg.pageUrl ?? null);
          }
          else if (msg.type === "mutations") msg.data.forEach(applyMutation);
          else if (msg.type === "events")    msg.data.forEach(applyUserEvent);
        });
      };
      ws.onerror = () => setStatus("error");
      return () => ws.close();
    } else {
      fetch(`${serverUrl}/sessions/${sessionId}`)
        .then(r => r.json())
        .then((data: RecordingMessage[]) => {
          setEvents(data);
          if (data.length > 0)
            setDuration(data[data.length - 1].timestamp - data[0].timestamp);
          const firstSnap = data.find(m => m.type === "snapshot");
          if (firstSnap?.pageUrl) setPageUrl(firstSnap.pageUrl);
          setStatus("ready");
        })
        .catch(() => setStatus("error"));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, serverUrl, live]);

  /**
   * Once events are loaded, immediately render the first snapshot to
   * the iframe so the user sees the page paused at frame 0 rather
   * than a blank screen until they hit Play. We also wait one tick
   * for the iframe's contentDocument to be available.
   */
  useEffect(() => {
    if (live || events.length === 0) return;
    let cancelled = false;
    const tryApply = () => {
      if (cancelled) return;
      if (!iframeRef.current?.contentDocument) {
        requestAnimationFrame(tryApply);
        return;
      }
      const firstSnap = events.find(m => m.type === "snapshot");
      if (!firstSnap) return;
      applySnapshot(firstSnap.data, firstSnap.pageUrl ?? pageUrl);
      idxRef.current = 0;
    };
    tryApply();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, live]);

  /* ── Playback loop ──
   * Playback state lives in refs so the effect doesn't tear down on
   * every RAF tick. The effect only re-runs when play/pause/events/speed
   * change. */
  const idxRef = useRef(0);
  const currentTimeRef = useRef(0);
  currentTimeRef.current = currentTime;

  useEffect(() => {
    if (!isPlaying || events.length === 0 || live) return;
    const startTimestamp = events[0].timestamp;

    // If the user scrubbed backwards, replay the snapshot before catching up
    const targetT = currentTimeRef.current;
    const lastIdx = idxRef.current;
    if (lastIdx > 0 && events[lastIdx]?.timestamp - startTimestamp > targetT) {
      const firstSnap = events.find(m => m.type === "snapshot");
      if (firstSnap) applySnapshot(firstSnap.data, firstSnap.pageUrl ?? pageUrl);
      idxRef.current = 0;
    }

    const t0 = Date.now() - currentTimeRef.current / playbackSpeed;
    let rafId = 0;

    function tick() {
      const elapsed = (Date.now() - t0) * playbackSpeed;
      setCurrentTime(elapsed);
      while (idxRef.current < events.length) {
        const ev = events[idxRef.current];
        if (ev.timestamp - startTimestamp > elapsed) break;
        if (ev.type === "snapshot")       applySnapshot(ev.data, ev.pageUrl ?? pageUrl);
        else if (ev.type === "mutations") ev.data.forEach(applyMutation);
        else if (ev.type === "events")    ev.data.forEach(applyUserEvent);
        idxRef.current++;
      }
      if (idxRef.current < events.length) rafId = requestAnimationFrame(tick);
      else setIsPlaying(false);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, events, playbackSpeed, live]);

  /* ── Scrubbing ── */
  const onScrub = useCallback((newTime: number) => {
    setIsPlaying(false);
    setCurrentTime(newTime);
    if (events.length === 0) return;
    const firstSnap = events.find(m => m.type === "snapshot");
    if (firstSnap) applySnapshot(firstSnap.data, firstSnap.pageUrl ?? pageUrl);
    const startTimestamp = events[0].timestamp;
    let i = 0;
    while (i < events.length && events[i].timestamp - startTimestamp <= newTime) {
      const ev = events[i];
      if (ev.type === "snapshot")       applySnapshot(ev.data, ev.pageUrl ?? pageUrl);
      else if (ev.type === "mutations") ev.data.forEach(applyMutation);
      else if (ev.type === "events")    ev.data.forEach(applyUserEvent);
      i++;
    }
    idxRef.current = i;
  }, [events, applyMutation, applyUserEvent, applySnapshot, pageUrl]);

  /* ── Status ── */
  const statusLabel = {
    loading: "Loading…",
    ready:   `${events.length.toLocaleString()} events`,
    live:    `${liveCount.toLocaleString()} events`,
    error:   "Error",
  }[status];

  const pct = duration > 0 ? Math.min((currentTime / duration) * 100, 100) : 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100vh",
      background: D.bg, color: D.text,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      WebkitFontSmoothing: "antialiased",
    }}>
      <style>{`
        @keyframes s-ripple {
          0%   { transform: scale(1); opacity: 0.85; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        input[type=range] {
          -webkit-appearance: none; appearance: none;
          height: 3px; background: ${D.border2}; outline: none; border: none;
          border-radius: 2px; cursor: pointer;
        }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 13px; height: 13px;
          background: ${D.accent}; border-radius: 50%; cursor: pointer;
          box-shadow: 0 0 0 3px ${D.accentBg};
        }
        input[type=range]::-webkit-slider-runnable-track {
          background: ${D.border2}; border-radius: 2px;
        }
        select option { background: ${D.card}; color: ${D.text}; }
      `}</style>

      {/* ── Top toolbar ── */}
      <div style={{
        height: 50, flexShrink: 0,
        background: D.surface,
        borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "center",
        padding: "0 16px", gap: 0,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 10px", marginRight: 12,
              border: `1px solid ${D.border2}`, borderRadius: 6,
              background: "transparent", color: D.textMid,
              fontSize: 12, cursor: "pointer",
              transition: "all 0.12s", fontFamily: "inherit",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = D.text; (e.currentTarget as HTMLElement).style.borderColor = D.textDim; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = D.textMid; (e.currentTarget as HTMLElement).style.borderColor = D.border2; }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M7 2L3 6l4 4"/>
            </svg>
            Sessions
          </button>
        )}

        <span style={{ color: D.textDim, fontSize: 12, marginRight: 10 }}>/</span>

        <span style={{
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 11, color: D.textMid,
          maxWidth: 220, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap",
          marginRight: 12,
        }}>
          {sessionId}
        </span>

        {live ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 9px", borderRadius: 4,
            background: D.greenBg, border: "1px solid rgba(34,197,94,0.32)",
            color: D.green, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: D.green, display: "inline-block", animation: "pulse 1.4s ease-in-out infinite" }} />
            LIVE
          </span>
        ) : (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "2px 9px", borderRadius: 4,
            background: "rgba(155,163,175,0.10)", border: "1px solid rgba(155,163,175,0.22)",
            color: D.textDim, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
          }}>
            REPLAY
          </span>
        )}

        {pageUrl && (
          <span style={{
            marginLeft: 12,
            fontSize: 11, color: D.textDim,
            maxWidth: 320, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap",
          }} title={pageUrl}>
            {pageUrl}
          </span>
        )}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: D.textDim, marginRight: 16 }}>
          {statusLabel}
        </span>

        {!live && (
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            style={{
              background: D.card, border: `1px solid ${D.border2}`,
              color: D.textMid, fontSize: 11, borderRadius: 5,
              padding: "3px 8px", cursor: "pointer",
              outline: "none", fontFamily: "inherit",
            }}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        )}
      </div>

      {/* ── Iframe viewport ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: D.bg }}>
        <div style={{
          position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
          boxShadow: "inset 0 0 0 1px " + D.border,
        }} />
        <iframe
          ref={iframeRef}
          sandbox="allow-same-origin"
          style={{ width: "100%", height: "100%", border: "none", background: "white", position: "relative", zIndex: 0, display: "block" }}
          title="Session replay"
        />
        {/* Cursor */}
        <div ref={cursorRef} style={{
          position: "absolute", top: 0, left: 0,
          width: 18, height: 18, pointerEvents: "none",
          transition: "left 0.05s linear, top 0.05s linear",
          zIndex: 9999,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M2 2L6.5 14L8.5 8.5L14 6.5L2 2Z"
                  fill="white" stroke="#111" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div style={{
        height: 56, flexShrink: 0,
        background: D.surface,
        borderTop: `1px solid ${D.border}`,
        display: "flex", alignItems: "center",
        padding: "0 20px", gap: 14,
      }}>
        {!live && (
          <button
            onClick={() => setIsPlaying(p => !p)}
            style={{
              width: 34, height: 34, borderRadius: 7, flexShrink: 0,
              border: `1px solid ${isPlaying ? D.accent : D.border2}`,
              background: isPlaying ? D.accentBg : "transparent",
              color: isPlaying ? D.accent : D.textMid,
              fontSize: 12, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.12s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = D.accent; (e.currentTarget as HTMLElement).style.color = D.accent; }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = isPlaying ? D.accent : D.border2;
              (e.currentTarget as HTMLElement).style.color = isPlaying ? D.accent : D.textMid;
            }}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
        )}

        {live && (
          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "5px 12px", background: D.greenBg,
            border: "1px solid rgba(34,197,94,0.30)", borderRadius: 6,
            flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: D.green, animation: "pulse 1.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 11, color: D.green, fontWeight: 500 }}>Live</span>
          </div>
        )}

        {!live && (
          <>
            <span style={{
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: 11, color: D.textDim, whiteSpace: "nowrap", flexShrink: 0,
              minWidth: 36, textAlign: "right",
            }}>
              {fmt(currentTime)}
            </span>
            <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
              <div style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                height: 3, width: `${pct}%`,
                background: D.accent, borderRadius: 2, pointerEvents: "none", zIndex: 1,
              }} />
              <input
                type="range" min={0} max={duration || 1} value={currentTime}
                onChange={e => onScrub(Number(e.target.value))}
                style={{ width: "100%", position: "relative", zIndex: 2 }}
              />
            </div>
            <span style={{
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: 11, color: D.textDim, whiteSpace: "nowrap", flexShrink: 0,
              minWidth: 36,
            }}>
              {fmt(duration)}
            </span>
          </>
        )}

        {live && <div style={{ flex: 1 }} />}

        <div style={{ width: 1, height: 22, background: D.border, flexShrink: 0 }} />

        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          {status === "error" && (
            <span style={{ fontSize: 10, fontWeight: 700, color: D.red, letterSpacing: "0.06em" }}>ERROR</span>
          )}
          {status === "loading" && (
            <span style={{ fontSize: 11, color: D.textDim }}>Loading…</span>
          )}
          {(status === "ready" || status === "live") && (
            <span style={{ fontSize: 11, color: D.textDim }}>{statusLabel}</span>
          )}
        </div>
      </div>
    </div>
  );
};

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

export default ReplayPlayer;
