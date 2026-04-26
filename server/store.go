// Store defines the persistence contract for recording data. Two
// implementations live in this package:
//
//   MemoryStore   — in-process, no external deps, used when
//                   DATABASE_URL is unset.
//   PostgresStore — durable, JSONB-backed. See postgres.go.
//
// The handler depends only on the Store interface, so swapping
// implementations is a single line in main.go.

package main

import (
	"fmt"
	"sync"
)

// Session represents a recorded session's metadata.
type Session struct {
	ID        string `json:"id"`
	StartTime int64  `json:"startTime"`
	EventCount int   `json:"eventCount"`
}

// Store defines the interface for persisting recording data.
type Store interface {
	SaveEvent(msg RecordingMessage) error
	ListSessions() ([]Session, error)
	GetSession(sessionID string) ([]RecordingMessage, error)
	Close() error
}

// ---- MemoryStore -------------------------------------------------

type MemoryStore struct {
	mu       sync.RWMutex
	sessions map[string][]RecordingMessage // sessionID -> events
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		sessions: make(map[string][]RecordingMessage),
	}
}

func (m *MemoryStore) SaveEvent(msg RecordingMessage) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sessions[msg.SessionID] = append(m.sessions[msg.SessionID], msg)
	return nil
}

func (m *MemoryStore) ListSessions() ([]Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var sessions []Session
	for id, events := range m.sessions {
		startTime := int64(0)
		if len(events) > 0 {
			startTime = events[0].Timestamp
		}
		sessions = append(sessions, Session{
			ID: id, StartTime: startTime, EventCount: len(events),
		})
	}
	return sessions, nil
}

func (m *MemoryStore) GetSession(sessionID string) ([]RecordingMessage, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	events, ok := m.sessions[sessionID]
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	return events, nil
}

func (m *MemoryStore) Close() error {
	return nil
}

// PostgresStore implementation lives in postgres.go.
