// Spectator server entry point.
//
// Routes:
//   WS  /ingest          SDK sends recording batches here
//   WS  /watch/{id}      Player connects for live viewing
//   GET /sessions        list all sessions
//   GET /sessions/{id}   replay data for a session
//   GET /stats/{id}      live watcher count
//   GET /healthz         liveness probe
//
// Env:
//   PORT             listen port (default 8080; Railway/Fly inject this)
//   DATABASE_URL     postgres DSN; unset → MemoryStore
//   ALLOWED_ORIGINS  comma-separated CORS/WS origin allowlist;
//                    unset → "*" (open mode)

package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	store, kind := buildStore()
	defer store.Close()

	hub := NewLiveHub()
	handler := NewHandler(store, hub)

	http.HandleFunc("/ingest", handler.HandleIngest)
	http.HandleFunc("/watch/", handler.HandleWatch)
	http.HandleFunc("/sessions", handler.HandleListSessions)
	http.HandleFunc("/sessions/", handler.HandleGetSession)
	http.HandleFunc("/stats/", handler.HandleStats)
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port

	log.Printf("spectator server listening on %s (store=%s, origins=%v)", addr, kind, allowedOrigins)
	log.Fatal(http.ListenAndServe(addr, nil))
}

// buildStore picks a Store implementation based on env. We prefer
// Postgres in production (DATABASE_URL set) and fall back to the
// in-memory store for local dev / CI smoke tests. If DATABASE_URL is
// set but the connection fails, we fail fast — silently downgrading
// would mask a real outage.
func buildStore() (Store, string) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Println("DATABASE_URL unset — using in-memory store (events will not survive restarts)")
		return NewMemoryStore(), "memory"
	}
	pg, err := NewPostgresStore(dsn)
	if err != nil {
		log.Fatalf("postgres init failed: %v", err)
	}
	return pg, "postgres"
}
