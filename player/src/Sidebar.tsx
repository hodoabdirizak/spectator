import React from "react";
import { D, type PageId } from "./theme";

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  serverUrl: string;
  error: boolean;
}

function SideIcon({ d }: { d: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none"
         stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

interface NavEntry {
  id: PageId;
  label: string;
  icon: string;
}

const NAV: NavEntry[] = [
  { id: "sessions", label: "Sessions",  icon: "M1.5 3h12M1.5 7h12M1.5 11h7" },
  { id: "heatmaps", label: "Heatmaps",  icon: "M2 2h4v4H2zM9 2h4v4H9zM2 9h4v4H2zM9 9h4v4H9z" },
  { id: "funnels",  label: "Funnels",   icon: "M1.5 2h12M3.5 6h8M5.5 10h4M7 14h1" },
  { id: "events",   label: "Events",    icon: "M7.5 1v5.5l3 2M1 7.5a6.5 6.5 0 1013 0 6.5 6.5 0 00-13 0" },
  { id: "settings", label: "Settings",  icon: "M7.5 5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM7.5 1v1.5M7.5 12.5V14M13 7.5h-1.5M3.5 7.5H2M11.2 3.8l-1 1M4.8 10.2l-1 1M11.2 11.2l-1-1M4.8 4.8l-1-1" },
];

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, serverUrl, error }) => {
  return (
    <aside style={{
      width: 220, flexShrink: 0,
      background: D.surface,
      borderRight: `1px solid ${D.border}`,
      display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh",
      overflow: "hidden",
    }}>
      {/* Wordmark */}
      <div style={{ padding: "18px 16px 16px", borderBottom: `1px solid ${D.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30,
            background: "linear-gradient(135deg, #4F8EFF 0%, #8B5CF6 100%)",
            borderRadius: 8, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="4"  cy="4"  r="2.5" fill="white" opacity="0.95"/>
              <circle cx="10" cy="4"  r="2.5" fill="white" opacity="0.35"/>
              <circle cx="4"  cy="10" r="2.5" fill="white" opacity="0.35"/>
              <circle cx="10" cy="10" r="2.5" fill="white" opacity="0.95"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D.text, letterSpacing: "-0.01em", lineHeight: 1.2 }}>
              Spectator
            </div>
            <div style={{ fontSize: 10, color: D.textDim, letterSpacing: "0.03em", marginTop: 1 }}>
              Session Replay
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "10px 8px", flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: D.textDim, padding: "6px 12px 10px" }}>
          Analyze
        </div>
        {NAV.map(item => {
          const active = currentPage === item.id;
          return (
            <NavButton
              key={item.id}
              active={active}
              icon={item.icon}
              label={item.label}
              onClick={() => onNavigate(item.id)}
            />
          );
        })}
      </nav>

      {/* Connection status */}
      <div style={{ padding: "14px 16px", borderTop: `1px solid ${D.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: error ? D.red : D.green,
            boxShadow: `0 0 8px ${error ? D.red : D.green}`,
          }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: error ? D.red : D.green }}>
            {error ? "Disconnected" : "Connected"}
          </span>
        </div>
        <div style={{
          fontSize: 10, color: D.textDim,
          fontFamily: "'Courier New', monospace",
          letterSpacing: "0.02em", wordBreak: "break-all",
        }}>
          {serverUrl}
        </div>
      </div>
    </aside>
  );
};

function NavButton({ active, icon, label, onClick }: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  const hovBg = !active && hov ? "rgba(255,255,255,0.04)" : active ? D.accentBg : "transparent";
  const color = active ? D.accent : hov ? D.text : D.textMid;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 6, marginBottom: 1,
        background: hovBg,
        color,
        cursor: "pointer", fontSize: 13,
        fontWeight: active ? 500 : 400,
        transition: "all 0.12s",
        border: "none",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <SideIcon d={icon} />
      {label}
    </button>
  );
}

export default Sidebar;
