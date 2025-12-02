package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/manpreetbhatti/lattice/backend/internal/db"
	"github.com/manpreetbhatti/lattice/backend/internal/ws"
)

func setupTestAPI(t *testing.T) (*API, func()) {
	t.Helper()

	tmpDir, err := os.MkdirTemp("", "lattice-api-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	database, err := db.New(dbPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create database: %v", err)
	}

	hub := ws.NewHub(database)
	go hub.Run()

	api := New(hub, database)

	cleanup := func() {
		database.Close()
		os.RemoveAll(tmpDir)
	}

	return api, cleanup
}

func TestHealthHandler(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()

	api.HealthHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]any
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response["status"] != "ok" {
		t.Errorf("Expected status 'ok', got '%v'", response["status"])
	}
}

func TestStatsHandler(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/stats", nil)
	w := httptest.NewRecorder()

	api.StatsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]any
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if _, ok := response["active_rooms"]; !ok {
		t.Error("Response should contain 'active_rooms'")
	}
	if _, ok := response["active_clients"]; !ok {
		t.Error("Response should contain 'active_clients'")
	}
}

func TestCreateRoom(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	tests := []struct {
		name           string
		body           map[string]string
		expectedStatus int
	}{
		{
			name:           "Create room with ID and name",
			body:           map[string]string{"id": "test-room-1", "name": "Test Room 1"},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "Create room with only ID",
			body:           map[string]string{"id": "test-room-2"},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "Missing ID should fail",
			body:           map[string]string{"name": "No ID Room"},
			expectedStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			bodyBytes, _ := json.Marshal(tt.body)
			req := httptest.NewRequest("POST", "/api/rooms", bytes.NewReader(bodyBytes))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			api.CreateRoomHandler(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}
		})
	}
}

func TestGetRoom(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	roomID := "get-test-room"
	api.database.CreateRoom(roomID, "Get Test Room")

	req := httptest.NewRequest("GET", "/api/rooms/"+roomID, nil)
	w := httptest.NewRecorder()

	api.GetRoomHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]any
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if response["id"] != roomID {
		t.Errorf("Expected room ID '%s', got '%v'", roomID, response["id"])
	}
}

func TestGetRoomNotFound(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/rooms/non-existent", nil)
	w := httptest.NewRecorder()

	api.GetRoomHandler(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("Expected status 404, got %d", w.Code)
	}
}

func TestListRooms(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	for i := 0; i < 5; i++ {
		api.database.CreateRoom("list-room-"+string(rune('a'+i)), "Room "+string(rune('A'+i)))
	}

	req := httptest.NewRequest("GET", "/api/rooms", nil)
	w := httptest.NewRecorder()

	api.ListRoomsHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var response map[string]any
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	rooms, ok := response["rooms"].([]any)
	if !ok {
		t.Fatal("Response should contain 'rooms' array")
	}

	if len(rooms) != 5 {
		t.Errorf("Expected 5 rooms, got %d", len(rooms))
	}
}

func TestListRoomsPagination(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	for i := 0; i < 10; i++ {
		api.database.CreateRoom("page-room-"+string(rune('a'+i)), "")
	}

	req := httptest.NewRequest("GET", "/api/rooms?limit=3", nil)
	w := httptest.NewRecorder()

	api.ListRoomsHandler(w, req)

	var response map[string]any
	json.NewDecoder(w.Body).Decode(&response)

	rooms := response["rooms"].([]any)
	if len(rooms) != 3 {
		t.Errorf("Expected 3 rooms with limit, got %d", len(rooms))
	}

	req = httptest.NewRequest("GET", "/api/rooms?limit=3&offset=7", nil)
	w = httptest.NewRecorder()

	api.ListRoomsHandler(w, req)

	json.NewDecoder(w.Body).Decode(&response)

	rooms = response["rooms"].([]any)
	if len(rooms) != 3 {
		t.Errorf("Expected 3 rooms with offset, got %d", len(rooms))
	}
}

func TestDeleteRoom(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	roomID := "delete-test-room"
	api.database.CreateRoom(roomID, "Delete Test")

	req := httptest.NewRequest("DELETE", "/api/rooms/"+roomID, nil)
	w := httptest.NewRecorder()

	api.DeleteRoomHandler(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	room, _ := api.database.GetRoom(roomID)
	if room != nil {
		t.Error("Room should have been deleted")
	}
}

func TestInvalidJSON(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/rooms", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	api.CreateRoomHandler(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected status 400, got %d", w.Code)
	}
}

func TestRoomsRouter(t *testing.T) {
	api, cleanup := setupTestAPI(t)
	defer cleanup()

	tests := []struct {
		name           string
		method         string
		path           string
		body           string
		expectedStatus int
	}{
		{
			name:           "GET /api/rooms - list",
			method:         "GET",
			path:           "/api/rooms",
			expectedStatus: http.StatusOK,
		},
		{
			name:           "POST /api/rooms - create",
			method:         "POST",
			path:           "/api/rooms",
			body:           `{"id": "router-test-room", "name": "Router Test"}`,
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "PUT /api/rooms - not allowed",
			method:         "PUT",
			path:           "/api/rooms",
			expectedStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var body *bytes.Reader
			if tt.body != "" {
				body = bytes.NewReader([]byte(tt.body))
			} else {
				body = bytes.NewReader([]byte{})
			}

			req := httptest.NewRequest(tt.method, tt.path, body)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			api.RoomsRouter(w, req)

			if w.Code != tt.expectedStatus {
				t.Errorf("Expected status %d, got %d", tt.expectedStatus, w.Code)
			}
		})
	}
}
