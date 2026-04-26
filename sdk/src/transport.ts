// Transport layer. Buffers recording messages and ships them to the
// server over a single persistent WebSocket.
//
// Batching: events accumulate in a buffer and are flushed either on a
// fixed interval (default 1s) or when the buffer hits a size cap
// (default 50). This is the same pattern used by Segment, Amplitude,
// and other analytics SDKs — per-event HTTP round-trips would drown
// out mousemove on any non-trivial page.
//
// Reconnect: on a non-intentional close we reconnect with exponential
// backoff (1s → 2s → 4s …) capped at 30s so the client recovers
// automatically from transient server restarts.

import { SerializedNode } from "./serialize.js";
import { MutationEvent } from "./observer.js";
import { UserEvent } from "./events.js";

export type RecordingMessage =
  | {
      type: "snapshot";
      data: SerializedNode;
      pageUrl?: string;
      viewport?: { width: number; height: number };
      timestamp: number;
      sessionId: string;
    }
  | { type: "mutations"; data: MutationEvent[]; timestamp: number; sessionId: string }
  | { type: "events"; data: UserEvent[]; timestamp: number; sessionId: string };

export interface TransportOptions {
  serverUrl: string;       // e.g. "ws://localhost:8080/ingest"
  flushIntervalMs: number; // how often to send batched events (e.g. 1000)
  maxBufferSize: number;   // flush early if buffer exceeds this many items (e.g. 50)
  sessionId: string;
}

/**
 * Creates a transport that buffers events and sends them over a WebSocket.
 */
export function createTransport(options: TransportOptions) {
  let ws: WebSocket | null = null;
  let buffer: RecordingMessage[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectDelay = 1000;
  let intentionalClose = false;

  function connect() {
    ws = new WebSocket(options.serverUrl);
    ws.onopen = () => {
      console.log("[spectator] connected");
      reconnectDelay = 1000; // reset on successful connection
    };
    ws.onerror = (e) => {
      console.error("[spectator] ws error", e);
    };
    ws.onclose = () => {
      console.log("[spectator] disconnected");
      if (!intentionalClose) {
        // Reconnect with exponential backoff, capped at 30s
        setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      }
    };
  }

  function flush() {
    if (buffer.length === 0) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(buffer));
    buffer = [];
  }

  function send(message: RecordingMessage) {
    buffer.push(message);
    if (buffer.length >= options.maxBufferSize) {
      flush();
    }
  }

  function disconnect() {
    intentionalClose = true;
    flush();
    if (flushTimer) clearInterval(flushTimer);
    if (ws) ws.close();
  }

  connect();
  flushTimer = setInterval(flush, options.flushIntervalMs);

  return { send, flush, disconnect };
}
