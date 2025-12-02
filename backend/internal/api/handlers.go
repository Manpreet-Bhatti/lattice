package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/manpreetbhatti/lattice/backend/internal/db"
	"github.com/manpreetbhatti/lattice/backend/internal/ws"
)

type API struct {
	hub      *ws.Hub
	database *db.Database
}

func New(hub *ws.Hub, database *db.Database) *API {
	return &API{
		hub:      hub,
		database: database,
	}
}

func jsonResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Error encoding JSON response: %v", err)
	}
}

func errorResponse(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

func (a *API) HealthHandler(w http.ResponseWriter, r *http.Request) {
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (a *API) StatsHandler(w http.ResponseWriter, r *http.Request) {
	stats := map[string]interface{}{
		"active_rooms":   a.hub.GetRoomCount(),
		"active_clients": a.hub.GetClientCount(),
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	}

	if a.database != nil {
		dbStats, err := a.database.GetStats()
		if err == nil {
			stats["total_rooms"] = dbStats["room_count"]
			stats["total_updates"] = dbStats["update_count"]
		}
	}

	jsonResponse(w, http.StatusOK, stats)
}

// Room handlers

type RoomResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ActiveUsers int       `json:"active_users"`
	UpdateCount int       `json:"update_count,omitempty"`
}

type CreateRoomRequest struct {
	ID   string `json:"id"`
	Name string `json:"name,omitempty"`
}

func (a *API) ListRoomsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	rooms, err := a.database.ListRooms(limit, offset)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to list rooms")
		return
	}

	activeRooms := a.hub.GetActiveRooms()

	response := make([]RoomResponse, len(rooms))
	for i, room := range rooms {
		response[i] = RoomResponse{
			ID:          room.ID,
			Name:        room.Name,
			CreatedAt:   room.CreatedAt,
			UpdatedAt:   room.UpdatedAt,
			ActiveUsers: activeRooms[room.ID],
		}
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"rooms":  response,
		"limit":  limit,
		"offset": offset,
	})
}

func (a *API) CreateRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.ID == "" {
		errorResponse(w, http.StatusBadRequest, "Room ID is required")
		return
	}

	if err := a.database.CreateRoom(req.ID, req.Name); err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to create room")
		return
	}

	room, err := a.database.GetRoom(req.ID)
	if err != nil || room == nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to get room")
		return
	}

	jsonResponse(w, http.StatusCreated, RoomResponse{
		ID:        room.ID,
		Name:      room.Name,
		CreatedAt: room.CreatedAt,
		UpdatedAt: room.UpdatedAt,
	})
}

func (a *API) GetRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract room ID from path: /api/rooms/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	roomID := strings.TrimSuffix(path, "/")

	if roomID == "" {
		errorResponse(w, http.StatusBadRequest, "Room ID is required")
		return
	}

	room, err := a.database.GetRoom(roomID)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to get room")
		return
	}

	if room == nil {
		errorResponse(w, http.StatusNotFound, "Room not found")
		return
	}

	updateCount, _ := a.database.GetUpdateCount(roomID)
	activeRooms := a.hub.GetActiveRooms()

	jsonResponse(w, http.StatusOK, RoomResponse{
		ID:          room.ID,
		Name:        room.Name,
		CreatedAt:   room.CreatedAt,
		UpdatedAt:   room.UpdatedAt,
		ActiveUsers: activeRooms[roomID],
		UpdateCount: updateCount,
	})
}

func (a *API) DeleteRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/rooms/")
	roomID := strings.TrimSuffix(path, "/")

	if roomID == "" {
		errorResponse(w, http.StatusBadRequest, "Room ID is required")
		return
	}

	if err := a.database.DeleteRoom(roomID); err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to delete room")
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Room deleted"})
}

func (a *API) RoomsRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/rooms")

	// /api/rooms or /api/rooms/
	if path == "" || path == "/" {
		switch r.Method {
		case http.MethodGet:
			a.ListRoomsHandler(w, r)
		case http.MethodPost:
			a.CreateRoomHandler(w, r)
		default:
			errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// /api/rooms/{id}
	switch r.Method {
	case http.MethodGet:
		a.GetRoomHandler(w, r)
	case http.MethodDelete:
		a.DeleteRoomHandler(w, r)
	default:
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
