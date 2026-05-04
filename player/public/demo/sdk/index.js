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
import { startRecording } from "./recorder.js";
export const Spectator = {
    start(options) {
        return startRecording(options);
    },
};
