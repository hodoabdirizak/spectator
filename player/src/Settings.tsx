// =============================================================
// Settings — SDK configuration that persists to localStorage
// =============================================================
// These settings are what you'd want to hand off to the SDK in a
// real product. We persist them to localStorage under the key
// `spectator:settings` and expose a tiny helper (getSettings) so
// the rest of the app can read them.
// =============================================================

import React, { useEffect, useState } from "react";
import { D } from "./theme";

export interface SpectatorSettings {
  serverUrl: string;
  maskInputs: boolean;
  flushIntervalMs: number;
  maxBufferSize: number;
  sampleRate: number;      // 0..1
  captureMouseMoves: boolean;
}

const DEFAULTS: SpectatorSettings = {
  serverUrl: "ws://localhost:8080/ingest",
  maskInputs: true,
  flushIntervalMs: 1000,
  maxBufferSize: 50,
  sampleRate: 1.0,
  captureMouseMoves: true,
};

const STORAGE_KEY = "spectator:settings";

export function getSettings(): SpectatorSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

interface SettingsProps {
  serverUrl: string;
}

export const Settings: React.FC<SettingsProps> = ({ serverUrl }) => {
  const [cfg, setCfg]     = useState<SpectatorSettings>(getSettings);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof SpectatorSettings>(k: K, v: SpectatorSettings[K]) => {
    setCfg(prev => ({ ...prev, [k]: v }));
    setDirty(true);
    setSaved(false);
  };

  const save = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => {
    setCfg(DEFAULTS);
    setDirty(true);
    setSaved(false);
  };

  // Warn before unload if unsaved
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "28px 32px 22px", borderBottom: `1px solid ${D.border}`,
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 11, color: D.textDim, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 8 }}>
            Workspace / Settings
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: D.text, letterSpacing: "-0.02em", margin: 0 }}>
            SDK Configuration
          </h1>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saved && (
            <span style={{
              fontSize: 12, color: D.green, display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", background: D.greenBg, borderRadius: 6,
              border: `1px solid rgba(34,197,94,0.30)`,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6l2.5 2.5L9.5 3.5" stroke={D.green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Saved
            </span>
          )}
          <button onClick={reset} style={{
            padding: "8px 14px", border: `1px solid ${D.border2}`, borderRadius: 7,
            background: "transparent", color: D.textMid, fontSize: 12, fontWeight: 500,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Reset
          </button>
          <button onClick={save} disabled={!dirty} style={{
            padding: "8px 18px", border: `1px solid ${dirty ? D.accent : D.border2}`, borderRadius: 7,
            background: dirty ? D.accent : "transparent",
            color: dirty ? "#fff" : D.textDim, fontSize: 12, fontWeight: 500,
            cursor: dirty ? "pointer" : "not-allowed",
            opacity: dirty ? 1 : 0.6,
            fontFamily: "inherit", transition: "all 0.12s",
          }}>
            Save changes
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>

          <Section title="Connection" desc="Where the SDK streams its recordings.">
            <Field label="Server URL" desc="WebSocket endpoint the SDK connects to.">
              <input
                value={cfg.serverUrl}
                onChange={e => update("serverUrl", e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Dashboard backend" desc="REST endpoint this dashboard reads from (read-only).">
              <input
                value={serverUrl}
                readOnly
                style={{ ...inputStyle, color: D.textDim, cursor: "not-allowed" }}
              />
            </Field>
          </Section>

          <Section title="Capture" desc="Controls what the SDK records from the page.">
            <Toggle
              label="Mask input values"
              desc="Replace text in <input> and <textarea> with asterisks before sending."
              value={cfg.maskInputs}
              onChange={v => update("maskInputs", v)}
            />
            <Toggle
              label="Capture mouse movement"
              desc="Record every mousemove. Disable to cut event volume by ~90% on chatty pages."
              value={cfg.captureMouseMoves}
              onChange={v => update("captureMouseMoves", v)}
            />
            <Field label="Sample rate" desc={`Record ${Math.round(cfg.sampleRate * 100)}% of sessions. Lower = cheaper storage.`}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={cfg.sampleRate}
                  onChange={e => update("sampleRate", Number(e.target.value))}
                  style={{ flex: 1, accentColor: D.accent }}
                />
                <span style={{
                  fontFamily: "'Courier New', monospace", fontSize: 12, color: D.text,
                  minWidth: 48, textAlign: "right", fontVariantNumeric: "tabular-nums",
                }}>
                  {(cfg.sampleRate * 100).toFixed(0)}%
                </span>
              </div>
            </Field>
          </Section>

          <Section title="Transport" desc="Batching behavior when sending events over the wire.">
            <Field label="Flush interval" desc="How often the SDK drains its buffer.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={100} max={10000} step={100}
                  value={cfg.flushIntervalMs}
                  onChange={e => update("flushIntervalMs", Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: D.textDim }}>milliseconds</span>
              </div>
            </Field>
            <Field label="Max buffer size" desc="Force a flush when the buffer reaches this many events.">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  min={1} max={1000} step={1}
                  value={cfg.maxBufferSize}
                  onChange={e => update("maxBufferSize", Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 140 }}
                />
                <span style={{ fontSize: 12, color: D.textDim }}>events</span>
              </div>
            </Field>
          </Section>

          <Section title="Integration snippet" desc="Drop this into any page to start recording with your current settings.">
            <pre style={{
              background: D.card, border: `1px solid ${D.border2}`, borderRadius: 8,
              padding: "16px 20px", margin: 0,
              fontSize: 12, color: D.textMid,
              fontFamily: "'Courier New', monospace", lineHeight: 1.8,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
            }}>
{`import { Spectator } from "spectator-sdk";

Spectator.start({
  serverUrl: "${cfg.serverUrl}",
  maskInputs: ${cfg.maskInputs},
  flushIntervalMs: ${cfg.flushIntervalMs},
  maxBufferSize: ${cfg.maxBufferSize},
  sampleRate: ${cfg.sampleRate},
  captureMouseMoves: ${cfg.captureMouseMoves},
});`}
            </pre>
          </Section>

        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: D.card,
  border: `1px solid ${D.border2}`,
  borderRadius: 7,
  color: D.text,
  fontSize: 13,
  outline: "none",
  fontFamily: "inherit",
};

function Section({ title, desc, children }: {
  title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      background: D.card, border: `1px solid ${D.border2}`, borderRadius: 10,
      padding: "20px 22px",
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D.text, letterSpacing: "-0.01em", marginBottom: 4 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: D.textMid, lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, desc, children }: {
  label: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: D.text, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: D.textDim, marginBottom: 8, lineHeight: 1.5 }}>
        {desc}
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, desc, value, onChange }: {
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: D.text, marginBottom: 3 }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: D.textDim, lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
      <button
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        style={{
          width: 38, height: 22, borderRadius: 11,
          background: value ? D.accent : D.border2,
          border: "none", padding: 0, cursor: "pointer",
          position: "relative", flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        <span style={{
          position: "absolute",
          top: 2, left: value ? 18 : 2,
          width: 18, height: 18, borderRadius: "50%",
          background: "#fff",
          transition: "left 0.15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        }}/>
      </button>
    </div>
  );
}

export default Settings;
