// LiveHub fans batches of recording data out to real-time watchers.
//
//   SDK --ws--> /ingest ---> Store.SaveEvent
//                        └-> LiveHub.Broadcast --ws--> /watch
//
// Each subscriber gets its own buffered channel (capacity 256). If a
// watcher falls behind, Broadcast drops the batch for that watcher
// rather than blocking the ingest goroutine — the recording pipeline
// is never held up by a slow client.

package main

import (
	"sync"
)

type LiveHub struct {
	mu          sync.RWMutex
	subscribers map[string][]chan []RecordingMessage // sessionID → watchers
}

func NewLiveHub() *LiveHub {
	return &LiveHub{
		subscribers: make(map[string][]chan []RecordingMessage),
	}
}

// Subscribe registers a new live watcher for a session.
// Returns a channel that will receive event batches.
func (h *LiveHub) Subscribe(sessionID string) chan []RecordingMessage {
	ch := make(chan []RecordingMessage, 256)
	h.mu.Lock()
	h.subscribers[sessionID] = append(h.subscribers[sessionID], ch)
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a watcher and closes its channel.
func (h *LiveHub) Unsubscribe(sessionID string, ch chan []RecordingMessage) {
	h.mu.Lock()
	defer h.mu.Unlock()
	subs := h.subscribers[sessionID]
	for i, sub := range subs {
		if sub == ch {
			h.subscribers[sessionID] = append(subs[:i], subs[i+1:]...)
			break
		}
	}
	close(ch)
	if len(h.subscribers[sessionID]) == 0 {
		delete(h.subscribers, sessionID)
	}
}

// Broadcast fans out a batch of events to all live watchers for a session.
// Non-blocking: drops the batch for any watcher whose buffer is full.
func (h *LiveHub) Broadcast(sessionID string, batch []RecordingMessage) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, ch := range h.subscribers[sessionID] {
		select {
		case ch <- batch:
		default:
			// slow consumer — drop this batch rather than blocking ingest
		}
	}
}

// ActiveWatchers returns the number of live viewers for a session.
func (h *LiveHub) ActiveWatchers(sessionID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subscribers[sessionID])
}
