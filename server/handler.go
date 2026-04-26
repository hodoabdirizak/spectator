// HTTP + WebSocket routes.
//
//   WS  /ingest         receive batched recording data from the SDK
//   WS  /watch/{id}     stream a live session to the player
//   GET /sessions       list all recorded sessions
//   GET /sessions/{id}  replay data for one session
//   GET /stats/{id}     live watcher count
//
// Each WebSocket connection runs in its own goroutine. At ~2 KB of
// stack overhead per goroutine the server scales to thousands of
// concurrent sessions without thread-pool tuning.

package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gorilla/websocket"
)

// allowedOrigins is the set of origins accepted by CORS and the
// WebSocket upgrader. Set ALLOWED_ORIGINS to a comma-separated list
// of exact origins (e.g. "https://spectator.vercel.app") to lock the
// server down to your player domain. If unset, "*" is allowed — fine
// for local dev and public demos.
var allowedOrigins = parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS"))

func parseAllowedOrigins(raw string) []string {
	if raw == "" {
		return []string{"*"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"*"}
	}
	return out
}

func originAllowed(origin string) bool {
	for _, a := range allowedOrigins {
		if a == "*" || a == origin {
			return true
		}
	}
	return false
}

// corsOriginFor picks the Access-Control-Allow-Origin value for this
// request: echo the request origin back when it's on the allowlist,
// otherwise "*" in wildcard mode or the first allowlisted origin.
func corsOriginFor(r *http.Request) string {
	if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
		return "*"
	}
	origin := r.Header.Get("Origin")
	if origin != "" && originAllowed(origin) {
		return origin
	}
	return allowedOrigins[0]
}

// RecordingMessage mirrors the TypeScript type from transport.ts.
// Data is kept as RawMessage so the server doesn't need to know the
// shape of every event variant — it just persists and forwards bytes.
// PageUrl + Viewport are only present on snapshot messages but live
// at the top level so the player can read them without parsing Data.
// `omitempty` keeps non-snapshot messages compact.
type RecordingMessage struct {
	Type      string          `json:"type"`      // "snapshot", "mutations", "events"
	Data      json.RawMessage `json:"data"`
	PageUrl   string          `json:"pageUrl,omitempty"`
	Viewport  json.RawMessage `json:"viewport,omitempty"`
	Timestamp int64           `json:"timestamp"`
	SessionID string          `json:"sessionId"`
}

type Handler struct {
	store Store
	hub   *LiveHub
}

func NewHandler(store Store, hub *LiveHub) *Handler {
	return &Handler{store: store, hub: hub}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Wildcard mode: accept any origin (useful for local dev and
		// any-origin SDK embeds).
		if len(allowedOrigins) == 1 && allowedOrigins[0] == "*" {
			return true
		}
		return originAllowed(r.Header.Get("Origin"))
	},
}

// corsHeaders sets CORS headers on every response so the player
// (running on a different origin) can call these endpoints. The
// allowed origin is driven by ALLOWED_ORIGINS so production can lock
// the server down to the player's deployed URL.
func corsHeaders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", corsOriginFor(r))
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Vary", "Origin")
}

// HandleIngest upgrades the HTTP connection to a WebSocket, reads recording
// data, stores each batch, and broadcasts it to any live watchers.
func (h *Handler) HandleIngest(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}
	defer conn.Close()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("ingest closed:", err)
			break
		}

		var batch []RecordingMessage
		if err := json.Unmarshal(message, &batch); err != nil {
			log.Println("parse error:", err)
			continue
		}

		for _, msg := range batch {
			if err := h.store.SaveEvent(msg); err != nil {
				log.Println("store error:", err)
			}
		}

		// Broadcast entire batch to any live watchers
		if len(batch) > 0 {
			h.hub.Broadcast(batch[0].SessionID, batch)
		}
	}
}

// HandleWatch upgrades to WebSocket and streams live events for a session.
// Events are pushed as they arrive from the SDK — no polling required.
func (h *Handler) HandleWatch(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimPrefix(r.URL.Path, "/watch/")
	if sessionID == "" {
		http.Error(w, "missing session ID", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("watch upgrade error:", err)
		return
	}
	defer conn.Close()

	log.Printf("live watcher connected for session %s (%d total)",
		sessionID, h.hub.ActiveWatchers(sessionID)+1)

	// First, replay all stored events so the watcher sees the full history
	// up to this moment, then stream new ones in real-time.
	existing, _ := h.store.GetSession(sessionID)
	if len(existing) > 0 {
		data, _ := json.Marshal(existing)
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}

	ch := h.hub.Subscribe(sessionID)
	defer h.hub.Unsubscribe(sessionID, ch)

	for batch := range ch {
		data, err := json.Marshal(batch)
		if err != nil {
			continue
		}
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			break
		}
	}

	log.Printf("live watcher disconnected from session %s", sessionID)
}

// HandleListSessions returns a JSON array of all session metadata.
func (h *Handler) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	corsHeaders(w, r)
	if r.Method == http.MethodOptions {
		return
	}
	sessions, err := h.store.ListSessions()
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}
	// Return empty array instead of null when no sessions
	if sessions == nil {
		sessions = []Session{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sessions)
}

// HandleGetSession returns all events for a specific session (for replay).
func (h *Handler) HandleGetSession(w http.ResponseWriter, r *http.Request) {
	corsHeaders(w, r)
	sessionID := strings.TrimPrefix(r.URL.Path, "/sessions/")

	events, err := h.store.GetSession(sessionID)
	if err != nil {
		http.Error(w, err.Error(), 404)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events)
}

// HandleStats returns live watcher count for a session.
func (h *Handler) HandleStats(w http.ResponseWriter, r *http.Request) {
	corsHeaders(w, r)
	sessionID := strings.TrimPrefix(r.URL.Path, "/stats/")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{
		"watchers": h.hub.ActiveWatchers(sessionID),
	})
}
