// PostgresStore is the durable Store implementation. Events survive
// process restarts; snapshots, mutations, and user events all share
// one JSONB column so no per-type schema is needed.
//
// Writes use a prepared INSERT — lib/pq reuses the parsed plan and
// the statement guards against injection. Reads are bounded by
// session_id, so the (session_id, timestamp) compound index is all
// that stands between us and a sequential scan.
//
// The database/sql pool is capped at 25 open connections so one
// server pod can't saturate the DB's max_connections.

package main

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "github.com/lib/pq"
)

type PostgresStore struct {
	db          *sql.DB
	insertStmt  *sql.Stmt
	listStmt    *sql.Stmt
	getStmt     *sql.Stmt
}

// NewPostgresStore opens a connection to the given DATABASE_URL,
// verifies the schema is reachable, and prepares the statements we
// use on every request. Returns an error on connection failure so
// main.go can fall back to MemoryStore or exit.
func NewPostgresStore(dsn string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening postgres: %w", err)
	}
	// 25 is a sensible default — tune per workload. Too high and a
	// single server node can exhaust the DB's max_connections.
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("pinging postgres: %w", err)
	}

	// Auto-create the events table if it doesn't exist. In a real
	// production system you'd use a migration tool (goose, sqlc, or
	// migrate). For a demo project this is the lowest-friction path
	// for a reviewer cloning the repo.
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS events (
			id         BIGSERIAL PRIMARY KEY,
			session_id TEXT        NOT NULL,
			type       TEXT        NOT NULL,
			data       JSONB       NOT NULL,
			timestamp  BIGINT      NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_events_session ON events (session_id);
		CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session_id, timestamp);
	`); err != nil {
		return nil, fmt.Errorf("schema init: %w", err)
	}

	insertStmt, err := db.Prepare(`
		INSERT INTO events (session_id, type, data, timestamp)
		VALUES ($1, $2, $3, $4)
	`)
	if err != nil {
		return nil, fmt.Errorf("prepare insert: %w", err)
	}

	listStmt, err := db.Prepare(`
		SELECT session_id, MIN(timestamp) AS start_time, COUNT(*) AS event_count
		FROM events
		GROUP BY session_id
		ORDER BY start_time DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("prepare list: %w", err)
	}

	getStmt, err := db.Prepare(`
		SELECT type, data, timestamp, session_id
		FROM events
		WHERE session_id = $1
		ORDER BY timestamp ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("prepare get: %w", err)
	}

	return &PostgresStore{
		db: db, insertStmt: insertStmt, listStmt: listStmt, getStmt: getStmt,
	}, nil
}

// SaveEvent persists one RecordingMessage. The `data` field is stored
// as raw JSONB so we don't lose fidelity for event types we didn't
// model explicitly.
func (p *PostgresStore) SaveEvent(msg RecordingMessage) error {
	// data is already json.RawMessage → Postgres accepts it as JSONB
	// when we cast it with ::jsonb. But since the prepared statement
	// was compiled without a cast, we rely on lib/pq recognizing []byte
	// as a JSON literal. Driving the driver directly with the raw
	// message keeps it a single allocation.
	_, err := p.insertStmt.Exec(msg.SessionID, msg.Type, []byte(msg.Data), msg.Timestamp)
	if err != nil {
		return fmt.Errorf("insert event: %w", err)
	}
	return nil
}

// ListSessions returns metadata for every session — derived from a
// GROUP BY on session_id. Cheap at demo scale; would move to a
// materialized view or cached aggregation in production.
func (p *PostgresStore) ListSessions() ([]Session, error) {
	rows, err := p.listStmt.Query()
	if err != nil {
		return nil, fmt.Errorf("list query: %w", err)
	}
	defer rows.Close()

	var out []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.StartTime, &s.EventCount); err != nil {
			return nil, fmt.Errorf("list scan: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list iter: %w", err)
	}
	return out, nil
}

// GetSession returns every message for one session in timestamp
// order. The raw `data` JSON is passed back unchanged so the replay
// player sees exactly what the SDK sent.
func (p *PostgresStore) GetSession(sessionID string) ([]RecordingMessage, error) {
	rows, err := p.getStmt.Query(sessionID)
	if err != nil {
		return nil, fmt.Errorf("get query: %w", err)
	}
	defer rows.Close()

	var out []RecordingMessage
	for rows.Next() {
		var m RecordingMessage
		var raw []byte
		if err := rows.Scan(&m.Type, &raw, &m.Timestamp, &m.SessionID); err != nil {
			return nil, fmt.Errorf("get scan: %w", err)
		}
		m.Data = json.RawMessage(raw)
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("get iter: %w", err)
	}
	if len(out) == 0 {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return out, nil
}

// Close releases prepared statements and the underlying connection
// pool. Safe to call on a partially constructed store.
func (p *PostgresStore) Close() error {
	if p.insertStmt != nil { _ = p.insertStmt.Close() }
	if p.listStmt   != nil { _ = p.listStmt.Close()   }
	if p.getStmt    != nil { _ = p.getStmt.Close()    }
	if p.db != nil {
		return p.db.Close()
	}
	return nil
}
