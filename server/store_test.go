// =============================================================
// Store round-trip tests (MemoryStore)
// =============================================================
// Exercises the public Store interface end-to-end against the
// in-memory implementation. Runs on every `go test ./...` — no
// external services required.
//
// The same tests can be re-run against PostgresStore by setting
// DATABASE_URL and invoking:
//     go test -tags integration ./...
// (see postgres_integration_test.go).
// =============================================================

package main

import (
	"encoding/json"
	"testing"
)

func TestMemoryStore_RoundTrip(t *testing.T) {
	runStoreRoundTrip(t, NewMemoryStore())
}

func TestMemoryStore_ConcurrentWrites(t *testing.T) {
	runStoreConcurrentWrites(t, NewMemoryStore())
}

func TestMemoryStore_UnknownSession(t *testing.T) {
	s := NewMemoryStore()
	defer s.Close()
	if _, err := s.GetSession("does-not-exist"); err == nil {
		t.Fatal("expected error for unknown session, got nil")
	}
}

// ---- Shared test bodies; also invoked by postgres_integration_test.go ----

func runStoreRoundTrip(t *testing.T, s Store) {
	t.Helper()
	defer s.Close()

	sessionID := "test-session-1"
	msgs := []RecordingMessage{
		{Type: "snapshot",  Data: json.RawMessage(`{"nodeType":1}`), Timestamp: 100, SessionID: sessionID},
		{Type: "mutations", Data: json.RawMessage(`[{"kind":"add"}]`), Timestamp: 200, SessionID: sessionID},
		{Type: "events",    Data: json.RawMessage(`[{"type":"click","x":10,"y":20}]`), Timestamp: 300, SessionID: sessionID},
	}

	for _, m := range msgs {
		if err := s.SaveEvent(m); err != nil {
			t.Fatalf("SaveEvent: %v", err)
		}
	}

	sessions, err := s.ListSessions()
	if err != nil {
		t.Fatalf("ListSessions: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("want 1 session, got %d", len(sessions))
	}
	got := sessions[0]
	if got.ID != sessionID {
		t.Errorf("session ID: want %s, got %s", sessionID, got.ID)
	}
	if got.EventCount != 3 {
		t.Errorf("event count: want 3, got %d", got.EventCount)
	}
	if got.StartTime != 100 {
		t.Errorf("start time: want 100, got %d", got.StartTime)
	}

	events, err := s.GetSession(sessionID)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if len(events) != 3 {
		t.Fatalf("events: want 3, got %d", len(events))
	}

	// Verify event ordering + payload fidelity.
	if events[0].Type != "snapshot" || events[1].Type != "mutations" || events[2].Type != "events" {
		t.Errorf("event order drifted: %v", []string{events[0].Type, events[1].Type, events[2].Type})
	}
	if string(events[0].Data) != `{"nodeType":1}` {
		t.Errorf("snapshot data round-trip mismatch: %s", events[0].Data)
	}
}

func runStoreConcurrentWrites(t *testing.T, s Store) {
	t.Helper()
	defer s.Close()

	const N = 100
	done := make(chan struct{}, N)
	for i := 0; i < N; i++ {
		go func(i int) {
			defer func() { done <- struct{}{} }()
			_ = s.SaveEvent(RecordingMessage{
				Type: "events", Data: json.RawMessage(`[]`),
				Timestamp: int64(i), SessionID: "concurrent-session",
			})
		}(i)
	}
	for i := 0; i < N; i++ {
		<-done
	}

	events, err := s.GetSession("concurrent-session")
	if err != nil {
		t.Fatalf("GetSession after concurrent writes: %v", err)
	}
	if len(events) != N {
		t.Errorf("want %d events, got %d — race condition?", N, len(events))
	}
}
