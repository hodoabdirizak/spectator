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
/**
 * Creates a transport that buffers events and sends them over a WebSocket.
 */
export function createTransport(options) {
    let ws = null;
    let buffer = [];
    let flushTimer = null;
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
        if (buffer.length === 0)
            return;
        if (!ws || ws.readyState !== WebSocket.OPEN)
            return;
        ws.send(JSON.stringify(buffer));
        buffer = [];
    }
    function send(message) {
        buffer.push(message);
        if (buffer.length >= options.maxBufferSize) {
            flush();
        }
    }
    function disconnect() {
        intentionalClose = true;
        flush();
        if (flushTimer)
            clearInterval(flushTimer);
        if (ws)
            ws.close();
    }
    connect();
    flushTimer = setInterval(flush, options.flushIntervalMs);
    return { send, flush, disconnect };
}
