// =============================================================
// SDK Entry Point — The Public API
// =============================================================
// This is what users of your SDK import. Keep it minimal.
//
// Usage (on any website):
//   import { Spectator } from "spectator-sdk";
//   const recorder = Spectator.start({ serverUrl: "ws://localhost:8080/ingest" });
//   // ... later ...
//   recorder.stop();
// =============================================================

import { startRecording, RecorderOptions } from "./recorder.js";

export const Spectator = {
  start(options: RecorderOptions) {
    return startRecording(options);
  },
};

export type { RecorderOptions } from "./recorder.js";
export type { SerializedNode } from "./serialize.js";
export type { MutationEvent } from "./observer.js";
export type { UserEvent } from "./events.js";
export type { RecordingMessage } from "./transport.js";
