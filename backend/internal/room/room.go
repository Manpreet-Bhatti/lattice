package room

import (
	"sync"
)

// A collaborative editing session
type Room struct {
	ID      string
	Updates [][]byte
	mu      sync.RWMutex
}

// Creates a new room with the given ID
func NewRoom(id string) *Room {
	return &Room{
		ID:      id,
		Updates: make([][]byte, 0),
	}
}

// Stores an update for late joiners
func (r *Room) AddUpdate(update []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Updates = append(r.Updates, update)
}

// Returns all stored updates for catch-up
func (r *Room) GetUpdates() [][]byte {
	r.mu.RLock()
	defer r.mu.RUnlock()
	// Return a copy to avoid race conditions
	updates := make([][]byte, len(r.Updates))
	copy(updates, r.Updates)
	return updates
}

// Removes all stored updates (for compaction)
func (r *Room) ClearUpdates() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Updates = make([][]byte, 0)
}
