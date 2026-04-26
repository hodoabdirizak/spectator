import React, { useCallback, useEffect, useState } from "react";
import { Sidebar } from "./Sidebar";
import { SessionList } from "./SessionList";
import { ReplayPlayer } from "./ReplayPlayer";
import { Heatmaps } from "./Heatmaps";
import { Funnels } from "./Funnels";
import { Events } from "./Events";
import { Settings } from "./Settings";
import { D, type PageId } from "./theme";

// Picked up from Vite's env at build time. Falls back to localhost
// for dev. In production set VITE_SERVER_URL to your Fly app URL.
const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "http://localhost:8080";

function App() {
  const [page, setPage]         = useState<PageId>("sessions");
  const [selected, setSelected] = useState<{ id: string; live: boolean } | null>(null);
  const [error, setError]       = useState(false);

  const handleError = useCallback((e: boolean) => setError(e), []);

  // Global health poll — keeps the sidebar connection indicator fresh
  // regardless of which page the user is on.
  useEffect(() => {
    const ping = () =>
      fetch(`${SERVER_URL}/sessions`, { method: "GET" })
        .then(r => { if (r.ok) setError(false); else setError(true); })
        .catch(() => setError(true));
    ping();
    const iv = setInterval(ping, 5000);
    return () => clearInterval(iv);
  }, []);

  // Replay takes over the whole viewport — no sidebar.
  if (selected) {
    return (
      <ReplayPlayer
        sessionId={selected.id}
        serverUrl={SERVER_URL}
        live={selected.live}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div style={{
      display: "flex", minHeight: "100vh",
      background: D.bg, color: D.text,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      WebkitFontSmoothing: "antialiased",
      fontSize: 13,
    }}>
      <Sidebar
        currentPage={page}
        onNavigate={(p) => setPage(p)}
        serverUrl={SERVER_URL}
        error={error}
      />

      {page === "sessions" && (
        <SessionList
          serverUrl={SERVER_URL}
          onSelectSession={(id, live = false) => setSelected({ id, live })}
          onError={handleError}
        />
      )}
      {page === "heatmaps" && <Heatmaps serverUrl={SERVER_URL} />}
      {page === "funnels"  && <Funnels  serverUrl={SERVER_URL} />}
      {page === "events"   && <Events   serverUrl={SERVER_URL} />}
      {page === "settings" && <Settings serverUrl={SERVER_URL} />}
    </div>
  );
}

export default App;
