package ws

import (
	"sync"
	"testing"
	"time"
)

// Simulates a WebSocket client for testing
type MockClient struct {
	id       string
	roomID   string
	send     chan []byte
	received [][]byte
	mu       sync.Mutex
}

func NewMockClient(id, roomID string) *MockClient {
	return &MockClient{
		id:       id,
		roomID:   roomID,
		send:     make(chan []byte, 256),
		received: make([][]byte, 0),
	}
}

func (m *MockClient) Receive() {
	for data := range m.send {
		m.mu.Lock()
		m.received = append(m.received, data)
		m.mu.Unlock()
	}
}

func (m *MockClient) GetReceived() [][]byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	result := make([][]byte, len(m.received))
	copy(result, m.received)
	return result
}

func TestRoomStateAddUpdate(t *testing.T) {
	roomState := NewRoomState()

	update1 := []byte{0, 1, 2, 3}
	update2 := []byte{4, 5, 6, 7}

	roomState.AddUpdate(update1)
	roomState.AddUpdate(update2)

	updates := roomState.GetUpdates()
	if len(updates) != 2 {
		t.Errorf("Expected 2 updates, got %d", len(updates))
	}

	if updates[0][0] != 0 || updates[0][3] != 3 {
		t.Error("First update content mismatch")
	}
	if updates[1][0] != 4 || updates[1][3] != 7 {
		t.Error("Second update content mismatch")
	}
}

func TestRoomStateConcurrency(t *testing.T) {
	roomState := NewRoomState()

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			roomState.AddUpdate([]byte{byte(i)})
		}(i)
	}
	wg.Wait()

	updates := roomState.GetUpdates()
	if len(updates) != 100 {
		t.Errorf("Expected 100 updates, got %d", len(updates))
	}
}

func TestHubCreation(t *testing.T) {
	hub := NewHub(nil)
	if hub == nil {
		t.Fatal("Hub should not be nil")
	}
	if hub.rooms == nil {
		t.Error("Hub rooms map should be initialized")
	}
	if hub.roomStates == nil {
		t.Error("Hub roomStates map should be initialized")
	}
}

func TestHubGetRoomState(t *testing.T) {
	hub := NewHub(nil)

	state1 := hub.getRoomState("test-room")
	if state1 == nil {
		t.Fatal("Room state should not be nil")
	}

	state2 := hub.getRoomState("test-room")
	if state1 != state2 {
		t.Error("Should return same room state instance")
	}

	state3 := hub.getRoomState("other-room")
	if state1 == state3 {
		t.Error("Different rooms should have different states")
	}
}

func TestHubRoomCount(t *testing.T) {
	hub := NewHub(nil)
	go hub.Run()

	if hub.GetRoomCount() != 0 {
		t.Errorf("Expected 0 rooms, got %d", hub.GetRoomCount())
	}

	hub.getRoomState("room-1")
	hub.getRoomState("room-2")
	hub.getRoomState("room-3")

	if hub.GetRoomCount() != 0 {
		t.Errorf("Expected 0 active rooms without clients, got %d", hub.GetRoomCount())
	}
}

func TestHubClientCount(t *testing.T) {
	hub := NewHub(nil)

	if hub.GetClientCount() != 0 {
		t.Errorf("Expected 0 clients, got %d", hub.GetClientCount())
	}
}

func TestHubActiveRooms(t *testing.T) {
	hub := NewHub(nil)

	activeRooms := hub.GetActiveRooms()
	if len(activeRooms) != 0 {
		t.Errorf("Expected 0 active rooms, got %d", len(activeRooms))
	}
}

func TestBroadcastMessage(t *testing.T) {
	hub := NewHub(nil)
	go hub.Run()

	time.Sleep(10 * time.Millisecond)

	roomID := "broadcast-test"
	roomState := hub.getRoomState(roomID)

	syncMessage := []byte{0, 1, 2, 3, 4}

	hub.broadcast <- &Message{
		RoomID: roomID,
		Data:   syncMessage,
		Sender: nil,
	}

	time.Sleep(10 * time.Millisecond)

	updates := roomState.GetUpdates()
	if len(updates) != 1 {
		t.Errorf("Expected 1 update stored, got %d", len(updates))
	}
}

func TestAwarenessMessageNotStored(t *testing.T) {
	hub := NewHub(nil)
	go hub.Run()

	time.Sleep(10 * time.Millisecond)

	roomID := "awareness-test"
	roomState := hub.getRoomState(roomID)

	awarenessMessage := []byte{1, 1, 2, 3, 4}

	hub.broadcast <- &Message{
		RoomID: roomID,
		Data:   awarenessMessage,
		Sender: nil,
	}

	time.Sleep(10 * time.Millisecond)

	updates := roomState.GetUpdates()
	if len(updates) != 0 {
		t.Errorf("Expected 0 updates stored for awareness, got %d", len(updates))
	}
}

func TestMultipleRoomsBroadcast(t *testing.T) {
	hub := NewHub(nil)
	go hub.Run()

	time.Sleep(10 * time.Millisecond)

	rooms := []string{"room-a", "room-b", "room-c"}

	for _, roomID := range rooms {
		hub.broadcast <- &Message{
			RoomID: roomID,
			Data:   []byte{0, byte(roomID[5])},
			Sender: nil,
		}
	}

	time.Sleep(20 * time.Millisecond)

	for _, roomID := range rooms {
		updates := hub.getRoomState(roomID).GetUpdates()
		if len(updates) != 1 {
			t.Errorf("Room %s: expected 1 update, got %d", roomID, len(updates))
		}
	}
}
