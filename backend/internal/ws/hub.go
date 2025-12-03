package ws

import (
	"log"
	"sync"

	"github.com/manpreetbhatti/lattice/backend/internal/compaction"
	"github.com/manpreetbhatti/lattice/backend/internal/db"
)

// Message types for Yjs protocol
const (
	MessageSync      = 0
	MessageAwareness = 1
)

// Sync message types
const (
	SyncStep1  = 0
	SyncStep2  = 1
	SyncUpdate = 2
)

// Stores in-memory state for active rooms
type RoomState struct {
	Updates         [][]byte
	AwarenessStates map[uint64][]byte
	ClientCount     int
	mu              sync.RWMutex
}

func NewRoomState() *RoomState {
	return &RoomState{
		Updates:         make([][]byte, 0),
		AwarenessStates: make(map[uint64][]byte),
	}
}

func (r *RoomState) AddUpdate(update []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	updateCopy := make([]byte, len(update))
	copy(updateCopy, update)
	r.Updates = append(r.Updates, updateCopy)
}

func (r *RoomState) GetUpdates() [][]byte {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.Updates
}

func (r *RoomState) SetUpdates(updates [][]byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Updates = updates
}

func (r *RoomState) GetAllAwareness() [][]byte {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([][]byte, 0, len(r.AwarenessStates))
	for _, state := range r.AwarenessStates {
		result = append(result, state)
	}
	return result
}

// Hub manages clients, rooms, and persistence
type Hub struct {
	rooms      map[string]map[*Client]bool
	roomStates map[string]*RoomState
	broadcast  chan *Message
	register   chan *Client
	unregister chan *Client
	stop       chan struct{}
	database   *db.Database
	mu         sync.RWMutex
}

type Message struct {
	RoomID string
	Data   []byte
	Sender *Client
}

func NewHub(database *db.Database) *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		roomStates: make(map[string]*RoomState),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		stop:       make(chan struct{}),
		database:   database,
	}
}

func (h *Hub) getRoomState(roomID string) *RoomState {
	h.mu.Lock()
	defer h.mu.Unlock()

	if state, ok := h.roomStates[roomID]; ok {
		return state
	}

	roomState := NewRoomState()
	h.roomStates[roomID] = roomState

	if h.database != nil {
		snapshot, snapshotCount, err := h.database.GetSnapshot(roomID)
		if err != nil {
			log.Printf("Error loading snapshot for room %s: %v", roomID, err)
		}

		var allUpdates [][]byte

		if len(snapshot) > 0 {
			snapshotUpdates := compaction.SplitMergedUpdates(snapshot)
			allUpdates = append(allUpdates, snapshotUpdates...)
			log.Printf("Loaded snapshot with %d updates for room %s", len(snapshotUpdates), roomID)
		}

		updates, err := h.database.GetAllUpdates(roomID)
		if err != nil {
			log.Printf("Error loading updates for room %s: %v", roomID, err)
		} else if len(updates) > 0 {
			allUpdates = append(allUpdates, updates...)
			log.Printf("Loaded %d recent updates for room %s (snapshot had %d)", len(updates), roomID, snapshotCount)
		}

		if len(allUpdates) > 0 {
			roomState.SetUpdates(allUpdates)
		}
	}

	return roomState
}

func (h *Hub) handleBroadcast(message *Message) {
	if len(message.Data) > 0 {
		messageType := message.Data[0]
		roomState := h.getRoomState(message.RoomID)

		if messageType == MessageSync {
			roomState.AddUpdate(message.Data)

			if h.database != nil {
				if err := h.database.SaveUpdate(message.RoomID, message.Data); err != nil {
					log.Printf("Error persisting update: %v", err)
				}
			}
		}
	}

	// Broadcast to other clients
	h.mu.RLock()
	clients, ok := h.rooms[message.RoomID]
	h.mu.RUnlock()

	if !ok {
		return
	}

	for client := range clients {
		if client != message.Sender {
			select {
			case client.send <- message.Data:
			default:
				h.mu.Lock()
				close(client.send)
				delete(clients, client)
				h.mu.Unlock()
			}
		}
	}
}

func (h *Hub) handleRegister(client *Client) {
	h.mu.Lock()
	if _, ok := h.rooms[client.roomID]; !ok {
		h.rooms[client.roomID] = make(map[*Client]bool)
	}
	h.rooms[client.roomID][client] = true
	clientCount := len(h.rooms[client.roomID])
	h.mu.Unlock()

	log.Printf("Client joined room %s (total: %d)", client.roomID, clientCount)

	roomState := h.getRoomState(client.roomID)
	updates := roomState.GetUpdates()

	if len(updates) > 0 {
		log.Printf("Sending %d updates to new client in room %s", len(updates), client.roomID)
		for _, update := range updates {
			select {
			case client.send <- update:
			default:
				log.Printf("Failed to send catch-up update")
			}
		}
	}

	// Send awareness states
	for _, state := range roomState.GetAllAwareness() {
		select {
		case client.send <- state:
		default:
		}
	}
}

func (h *Hub) Run() {
	for {
		select {
		case <-h.stop:
			return
		case client := <-h.register:
			h.handleRegister(client)
		case client := <-h.unregister:
			h.handleUnregister(client)
		case message := <-h.broadcast:
			h.handleBroadcast(message)
		}
	}
}

func (h *Hub) Stop() {
	close(h.stop)
}

func (h *Hub) handleUnregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if clients, ok := h.rooms[client.roomID]; ok {
		if _, ok := clients[client]; ok {
			delete(clients, client)
			close(client.send)

			if len(clients) == 0 {
				delete(h.rooms, client.roomID)
				log.Printf("Room %s closed (empty)", client.roomID)
			} else {
				log.Printf("Client left room %s (remaining: %d)", client.roomID, len(clients))
			}
		}
	}
}

func (h *Hub) GetRoomCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return len(h.rooms)
}

func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	count := 0
	for _, clients := range h.rooms {
		count += len(clients)
	}

	return count
}

func (h *Hub) GetActiveRooms() map[string]int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	result := make(map[string]int)
	for roomID, clients := range h.rooms {
		result[roomID] = len(clients)
	}

	return result
}
