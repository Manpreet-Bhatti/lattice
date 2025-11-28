package ws

import (
	"log"
	"sync"
)

// The set of active clients and broadcasts messages to clients
type Hub struct {
	// Registered clients by room
	rooms map[string]map[*Client]bool

	// Inbound messages from clients
	broadcast chan *Message

	// Register requests from clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	mu sync.RWMutex
}

type Message struct {
	RoomID string
	Data   []byte
	Sender *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		broadcast:  make(chan *Message),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if _, ok := h.rooms[client.roomID]; !ok {
				h.rooms[client.roomID] = make(map[*Client]bool)
			}
			h.rooms[client.roomID][client] = true
			clientCount := len(h.rooms[client.roomID])
			h.mu.Unlock()

			log.Printf("Client joined room %s (total: %d)", client.roomID, clientCount)

		case client := <-h.unregister:
			h.mu.Lock()
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
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			if clients, ok := h.rooms[message.RoomID]; ok {
				for client := range clients {
					if client != message.Sender {
						select {
						case client.send <- message.Data:
						default:
							close(client.send)
							delete(clients, client)
						}
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}
