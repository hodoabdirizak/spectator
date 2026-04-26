-- =============================================================
-- Spectator — initial schema
-- =============================================================
-- This file is also auto-executed by PostgresStore on startup if
-- the table doesn't exist, but shipping it as a migration file
-- gives you two things:
--   1. docker-entrypoint-initdb.d runs it when the container first
--      initializes its data volume — so `docker compose up` gives
--      you a schema-ready DB without needing the Go server to run.
--   2. A canonical, reviewable record of the schema in source
--      control, rather than only living in the Go code.
-- =============================================================

CREATE TABLE IF NOT EXISTS events (
    id         BIGSERIAL   PRIMARY KEY,
    session_id TEXT        NOT NULL,
    type       TEXT        NOT NULL,  -- 'snapshot' | 'mutations' | 'events'
    data       JSONB       NOT NULL,
    timestamp  BIGINT      NOT NULL,  -- client-side Date.now()
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- All hot reads are bounded by session_id.
CREATE INDEX IF NOT EXISTS idx_events_session     ON events (session_id);
-- Composite covers the common "give me this session in order" scan
-- without requiring a separate ORDER BY sort.
CREATE INDEX IF NOT EXISTS idx_events_session_ts  ON events (session_id, timestamp);
