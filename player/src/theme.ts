// Industry-standard dark palette modeled on Linear / PostHog / LogRocket —
// the visual language developers expect from a session-replay / observability
// tool. Cool slate background, calm blue primary accent, conventional
// semantic greens / ambers / reds.
export const D = {
  bg:       "#0E1014",   // near-black page background, slight cool cast
  surface:  "#15181F",   // sidebar, table headers
  card:     "#1B1F27",   // elevated rows, panels
  border:   "#232831",   // subtle dividers
  border2:  "#2D333E",   // stronger dividers, input borders
  text:     "#E6E8EB",   // primary text (off-white)
  textMid:  "#9BA3AF",   // secondary text
  textDim:  "#6B7280",   // tertiary / muted text
  accent:   "#4F8EFF",   // primary action blue
  accentBg: "rgba(79,142,255,0.12)",
  green:    "#22C55E",   // success / live / connected
  greenBg:  "rgba(34,197,94,0.12)",
  red:      "#EF4444",   // errors
  redBg:    "rgba(239,68,68,0.10)",
  amber:    "#F59E0B",   // warning
  amberBg:  "rgba(245,158,11,0.12)",
  purple:   "#8B5CF6",   // secondary accent
  purpleBg: "rgba(139,92,246,0.10)",
};

export type PageId = "sessions" | "heatmaps" | "funnels" | "events" | "settings";
