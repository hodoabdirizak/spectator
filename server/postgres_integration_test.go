//go:build integration

// =============================================================
// PostgresStore integration tests
// =============================================================
// These run against a real Postgres instance — they DO NOT run on a
// default `go test ./...` invocation. Run them with:
//
//   docker compose up -d postgres
//   DATABASE_URL="postgres://spectator:spectator@localhost:5432/spectator?sslmode=disable" \
//     go test -tags integration ./server/...
//
// The test truncates the events table before each run so it's safe
// to re-run repeatedly against the same database.
//
// By reusing runStoreRoundTrip + runStoreConcurrentWrites from
// store_test.go, we verify that PostgresStore behaves identically to
// MemoryStore from the caller's perspective — which is exactly the
// Store interface's promise.
// =============================================================

package main

import (
	"os"
	"testing"
)

func newTestPostgres(t *testing.T) *PostgresStore {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set — skipping Postgres integration test")
	}
	p, err := NewPostgresStore(dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	// Clean slate between tests so re-runs don't accumulate state.
	if _, err := p.db.Exec("TRUNCATE events RESTART IDENTITY"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return p
}

func TestPostgresStore_RoundTrip(t *testing.T) {
	runStoreRoundTrip(t, newTestPostgres(t))
}

func TestPostgresStore_ConcurrentWrites(t *testing.T) {
	runStoreConcurrentWrites(t, newTestPostgres(t))
}

func TestPostgresStore_UnknownSession(t *testing.T) {
	p := newTestPostgres(t)
	defer p.Close()
	if _, err := p.GetSession("does-not-exist"); err == nil {
		t.Fatal("expected error for unknown session, got nil")
	}
}
