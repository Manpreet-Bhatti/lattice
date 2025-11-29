package ws

import (
	"log"
	"sync"
)

// Message types for Yjs protocol
const (
	MessageSync      = 0
	MessageAwareness = 1
)

// Sync message types
const (
	SyncStep1  = 0 // Client sends state vector
	SyncStep2  = 1 // Server sends missing updates
	SyncUpdate = 2 // Regular update
)

// Document state for a room
type RoomState struct {
	Updates         [][]byte
	AwarenessStates map[uint64][]byte
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

func (r *RoomState) SetAwareness(clientID uint64, state []byte) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(state) == 0 {
		delete(r.AwarenessStates, clientID)
	} else {
		stateCopy := make([]byte, len(state))
		copy(stateCopy, state)
		r.AwarenessStates[clientID] = stateCopy
	}
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

// Hub for managing clients and broadcasting messages
type Hub struct {
	rooms      map[string]map[*Client]bool
	roomStates map[string]*RoomState
	broadcast  chan *Message
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

type Message struct {
	RoomID string
	Data   []byte
	Sender *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		roomStates: make(map[string]*RoomState),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) getRoomState(roomID string) *RoomState {
	h.mu.Lock()
	defer h.mu.Unlock()

	if _, ok := h.roomStates[roomID]; !ok {
		h.roomStates[roomID] = NewRoomState()
	}

	return h.roomStates[roomID]
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.handleRegister(client)

		case client := <-h.unregister:
			h.handleUnregister(client)

		case message := <-h.broadcast:
			h.handleBroadcast(message)
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

	// Send existing document state to the new client
	roomState := h.getRoomState(client.roomID)
	updates := roomState.GetUpdates()

	if len(updates) > 0 {
		log.Printf("Sending %d stored updates to new client in room %s", len(updates), client.roomID)

		for _, update := range updates {
			select {
			case client.send <- update:
			default:
				log.Printf("Failed to send catch-up update to client")
			}
		}
	}

	// Send existing awareness states
	awarenessStates := roomState.GetAllAwareness()
	for _, state := range awarenessStates {
		select {
		case client.send <- state:
		default:
			log.Printf("Failed to send awareness state to client")
		}
	}
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

func (h *Hub) handleBroadcast(message *Message) {
	if len(message.Data) > 0 {
		messageType := message.Data[0]
		roomState := h.getRoomState(message.RoomID)

		switch messageType {
		case MessageSync:
			roomState.AddUpdate(message.Data)
		case MessageAwareness:

		}
	}

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
