// Public entry point. Wires the snapshot, mutation observer, event
// capture, and transport together behind a simple start/stop API.

import { takeFullSnapshot } from "./serialize.js";
import { startObserver } from "./observer.js";
import { startEventCapture } from "./events.js";
import { createTransport } from "./transport.js";

export interface RecorderOptions {
  serverUrl: string;        // e.g. "ws://localhost:8080/ingest"
  sessionId?: string;       // auto-generated if omitted
  maskInputs?: boolean;     // replace typed values with "•••" for privacy
  flushIntervalMs?: number; // how often to batch-send (default 1000ms)
  maxBufferSize?: number;   // flush early if buffer hits this size (default 50)
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Starts a recording session. Returns { sessionId, stop }.
 *
 * Usage:
 *   const rec = Spectator.start({ serverUrl: "ws://localhost:8080/ingest" });
 *   // ... user browses ...
 *   rec.stop();
 */
export function startRecording(options: RecorderOptions) {
  const sessionId = options.sessionId ?? generateSessionId();

  const transport = createTransport({
    serverUrl: options.serverUrl,
    flushIntervalMs: options.flushIntervalMs ?? 1000,
    maxBufferSize: options.maxBufferSize ?? 50,
    sessionId,
  });

  // 1. Full DOM snapshot — the "keyframe" that replay starts from.
  //    pageUrl + viewport are baked into the snapshot so the replay
  //    iframe can resolve relative URLs (via <base>) and size itself
  //    to match the original viewport.
  const snapshot = takeFullSnapshot(document);
  if (snapshot) {
    transport.send({
      type: "snapshot",
      data: snapshot,
      pageUrl: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      timestamp: Date.now(),
      sessionId,
    } as any);
  }

  // 2. DOM mutations — every add/remove/attribute/text change
  const stopObserver = startObserver(document, (mutations) => {
    transport.send({ type: "mutations", data: mutations, timestamp: Date.now(), sessionId });
  });

  // 3. User events — mouse, click, scroll, input, resize
  const stopEvents = startEventCapture(
    document,
    (event) => {
      transport.send({ type: "events", data: [event], timestamp: Date.now(), sessionId });
    },
    { maskInputs: options.maskInputs ?? false }
  );

  return {
    sessionId,
    stop() {
      stopObserver();
      stopEvents();
      transport.disconnect();
    },
  };
}
