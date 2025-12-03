package ws

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/manpreetbhatti/lattice/backend/internal/ratelimit"
)

const (
	writeWait         = 10 * time.Second
	pongWait          = 60 * time.Second
	pingPeriod        = (pongWait * 9) / 10
	maxMessageSize    = 1024 * 1024
	messagesPerSecond = 100
	messageBurst      = 200
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	roomID      string
	rateLimiter *ratelimit.Limiter
	clientID    string
}

func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "default"
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}

	clientID := fmt.Sprintf("%s-%d", conn.RemoteAddr().String(), time.Now().UnixNano())

	client := &Client{
		hub:         hub,
		conn:        conn,
		send:        make(chan []byte, 512),
		roomID:      roomID,
		rateLimiter: ratelimit.NewLimiter(messagesPerSecond, messageBurst),
		clientID:    clientID,
	}

	hub.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	rateLimitWarnings := 0

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		if !c.rateLimiter.Allow() {
			rateLimitWarnings++
			if rateLimitWarnings%100 == 1 {
				log.Printf("⚠️ Rate limit exceeded for client %s in room %s (warning #%d)",
					c.clientID, c.roomID, rateLimitWarnings)
			}
			if rateLimitWarnings > 1000 {
				log.Printf("🚫 Disconnecting client %s for excessive rate limit violations", c.clientID)
				return
			}
			continue
		}

		if err := validateYjsMessage(message); err != nil {
			log.Printf("⚠️ Invalid message from client %s: %v", c.clientID, err)
			continue
		}

		c.hub.broadcast <- &Message{
			RoomID: c.roomID,
			Data:   message,
			Sender: c,
		}
	}
}

func validateYjsMessage(data []byte) error {
	if len(data) == 0 {
		return fmt.Errorf("empty message")
	}

	messageType := data[0]

	switch messageType {
	case MessageSync:
		if len(data) < 2 {
			return fmt.Errorf("sync message too short")
		}
		syncType := data[1]
		if syncType > 2 {
			return fmt.Errorf("invalid sync type: %d", syncType)
		}
		return nil
	case MessageAwareness:
		if len(data) < 2 {
			return fmt.Errorf("awareness message too short")
		}
		return nil
	default:
		return fmt.Errorf("unknown message type: %d", messageType)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.BinaryMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
