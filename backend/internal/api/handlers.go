package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

// Version handlers

type CreateVersionRequest struct {
	RoomID      string `json:"room_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Content     string `json:"content"`
	CreatedBy   string `json:"created_by"`
	IsAuto      bool   `json:"is_auto"`
}

type VersionResponse struct {
	ID          int       `json:"id"`
	RoomID      string    `json:"room_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Content     string    `json:"content,omitempty"` // Omit in list view
	ContentHash string    `json:"content_hash"`
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	IsAuto      bool      `json:"is_auto"`
}

func hashContent(content string) string {
	h := sha256.Sum256([]byte(content))
	return hex.EncodeToString(h[:8])
}

// ListVersionsHandler returns all versions for a room
func (a *API) ListVersionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	roomID := r.URL.Query().Get("room_id")
	if roomID == "" {
		errorResponse(w, http.StatusBadRequest, "room_id is required")
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if offset < 0 {
		offset = 0
	}

	versions, err := a.database.ListVersions(roomID, limit, offset)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to list versions")
		return
	}

	response := make([]VersionResponse, len(versions))
	for i, v := range versions {
		response[i] = VersionResponse{
			ID:          v.ID,
			RoomID:      v.RoomID,
			Name:        v.Name,
			Description: v.Description,
			ContentHash: v.ContentHash,
			CreatedBy:   v.CreatedBy,
			CreatedAt:   v.CreatedAt,
			IsAuto:      v.IsAuto,
		}
	}

	total, _ := a.database.GetVersionCount(roomID)

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"versions": response,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

func (a *API) CreateVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req CreateVersionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.RoomID == "" {
		errorResponse(w, http.StatusBadRequest, "room_id is required")
		return
	}

	if req.Content == "" {
		errorResponse(w, http.StatusBadRequest, "content is required")
		return
	}

	// Generate name if not provided
	if req.Name == "" {
		if req.IsAuto {
			req.Name = fmt.Sprintf("Auto-save %s", time.Now().Format("Jan 2, 3:04 PM"))
		} else {
			req.Name = fmt.Sprintf("Version %s", time.Now().Format("Jan 2, 3:04 PM"))
		}
	}

	contentHash := hashContent(req.Content)

	// Check if this is a duplicate (same content hash as latest)
	latest, err := a.database.GetLatestVersion(req.RoomID)
	if err == nil && latest != nil && latest.ContentHash == contentHash {
		// Skip duplicate auto-saves
		if req.IsAuto {
			jsonResponse(w, http.StatusOK, VersionResponse{
				ID:          latest.ID,
				RoomID:      latest.RoomID,
				Name:        latest.Name,
				Description: latest.Description,
				ContentHash: latest.ContentHash,
				CreatedBy:   latest.CreatedBy,
				CreatedAt:   latest.CreatedAt,
				IsAuto:      latest.IsAuto,
			})
			return
		}
	}

	version, err := a.database.CreateVersion(
		req.RoomID, req.Name, req.Description, req.Content, contentHash, req.CreatedBy, req.IsAuto,
	)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to create version")
		return
	}

	// Clean up old auto-saves (keep last 20)
	if req.IsAuto {
		if err := a.database.DeleteOldAutoVersions(req.RoomID, 20); err != nil {
			log.Printf("Failed to clean up old auto versions: %v", err)
		}
	}

	jsonResponse(w, http.StatusCreated, VersionResponse{
		ID:          version.ID,
		RoomID:      version.RoomID,
		Name:        version.Name,
		Description: version.Description,
		ContentHash: version.ContentHash,
		CreatedBy:   version.CreatedBy,
		CreatedAt:   version.CreatedAt,
		IsAuto:      version.IsAuto,
	})
}

// GetVersionHandler retrieves a specific version with full content
func (a *API) GetVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract version ID from path: /api/versions/{id}
	path := strings.TrimPrefix(r.URL.Path, "/api/versions/")
	versionID, err := strconv.Atoi(strings.TrimSuffix(path, "/"))
	if err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid version ID")
		return
	}

	version, err := a.database.GetVersion(versionID)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to get version")
		return
	}

	if version == nil {
		errorResponse(w, http.StatusNotFound, "Version not found")
		return
	}

	jsonResponse(w, http.StatusOK, VersionResponse{
		ID:          version.ID,
		RoomID:      version.RoomID,
		Name:        version.Name,
		Description: version.Description,
		Content:     version.Content,
		ContentHash: version.ContentHash,
		CreatedBy:   version.CreatedBy,
		CreatedAt:   version.CreatedAt,
		IsAuto:      version.IsAuto,
	})
}

// DeleteVersionHandler removes a version
func (a *API) DeleteVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/versions/")
	versionID, err := strconv.Atoi(strings.TrimSuffix(path, "/"))
	if err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid version ID")
		return
	}

	if err := a.database.DeleteVersion(versionID); err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to delete version")
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{"message": "Version deleted"})
}

// DiffVersionsHandler computes diff between two versions
func (a *API) DiffVersionsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	fromID, err := strconv.Atoi(r.URL.Query().Get("from"))
	if err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid 'from' version ID")
		return
	}

	toID, err := strconv.Atoi(r.URL.Query().Get("to"))
	if err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid 'to' version ID")
		return
	}

	fromVersion, err := a.database.GetVersion(fromID)
	if err != nil || fromVersion == nil {
		errorResponse(w, http.StatusNotFound, "From version not found")
		return
	}

	toVersion, err := a.database.GetVersion(toID)
	if err != nil || toVersion == nil {
		errorResponse(w, http.StatusNotFound, "To version not found")
		return
	}

	// Compute line-by-line diff
	diff := computeDiff(fromVersion.Content, toVersion.Content)

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"from": VersionResponse{
			ID:          fromVersion.ID,
			Name:        fromVersion.Name,
			ContentHash: fromVersion.ContentHash,
			CreatedAt:   fromVersion.CreatedAt,
		},
		"to": VersionResponse{
			ID:          toVersion.ID,
			Name:        toVersion.Name,
			ContentHash: toVersion.ContentHash,
			CreatedAt:   toVersion.CreatedAt,
		},
		"diff": diff,
	})
}

// DiffLine represents a single line in a diff
type DiffLine struct {
	Type    string `json:"type"` // "added", "removed", "unchanged"
	Content string `json:"content"`
	OldLine int    `json:"old_line,omitempty"`
	NewLine int    `json:"new_line,omitempty"`
}

// computeDiff performs a simple line-by-line diff using LCS
func computeDiff(oldContent, newContent string) []DiffLine {
	oldLines := strings.Split(oldContent, "\n")
	newLines := strings.Split(newContent, "\n")

	// Simple LCS-based diff
	lcs := lcsMatrix(oldLines, newLines)
	return backtrackDiff(oldLines, newLines, lcs)
}

func lcsMatrix(a, b []string) [][]int {
	m, n := len(a), len(b)
	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}

	for i := 1; i <= m; i++ {
		for j := 1; j <= n; j++ {
			if a[i-1] == b[j-1] {
				dp[i][j] = dp[i-1][j-1] + 1
			} else {
				dp[i][j] = max(dp[i-1][j], dp[i][j-1])
			}
		}
	}
	return dp
}

func backtrackDiff(oldLines, newLines []string, lcs [][]int) []DiffLine {
	var result []DiffLine
	i, j := len(oldLines), len(newLines)
	oldLineNum, newLineNum := len(oldLines), len(newLines)

	// Backtrack to build diff
	var stack []DiffLine
	for i > 0 || j > 0 {
		if i > 0 && j > 0 && oldLines[i-1] == newLines[j-1] {
			stack = append(stack, DiffLine{
				Type:    "unchanged",
				Content: oldLines[i-1],
				OldLine: oldLineNum,
				NewLine: newLineNum,
			})
			i--
			j--
			oldLineNum--
			newLineNum--
		} else if j > 0 && (i == 0 || lcs[i][j-1] >= lcs[i-1][j]) {
			stack = append(stack, DiffLine{
				Type:    "added",
				Content: newLines[j-1],
				NewLine: newLineNum,
			})
			j--
			newLineNum--
		} else if i > 0 {
			stack = append(stack, DiffLine{
				Type:    "removed",
				Content: oldLines[i-1],
				OldLine: oldLineNum,
			})
			i--
			oldLineNum--
		}
	}

	// Reverse the stack
	for k := len(stack) - 1; k >= 0; k-- {
		result = append(result, stack[k])
	}

	return result
}

func (a *API) RestoreVersionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// Extract version ID from path: /api/versions/{id}/restore
	path := strings.TrimPrefix(r.URL.Path, "/api/versions/")
	path = strings.TrimSuffix(path, "/restore")
	versionID, err := strconv.Atoi(path)
	if err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid version ID")
		return
	}

	version, err := a.database.GetVersion(versionID)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to get version")
		return
	}

	if version == nil {
		errorResponse(w, http.StatusNotFound, "Version not found")
		return
	}

	restoreName := fmt.Sprintf("Restored from: %s", version.Name)
	newVersion, err := a.database.CreateVersion(
		version.RoomID,
		restoreName,
		fmt.Sprintf("Restored to version %d (%s)", version.ID, version.Name),
		version.Content,
		version.ContentHash,
		"", // No specific creator for restore
		false,
	)
	if err != nil {
		errorResponse(w, http.StatusInternalServerError, "Failed to create restore version")
		return
	}

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"message":       "Version restored",
		"restored_from": version.ID,
		"new_version":   newVersion.ID,
		"room_id":       version.RoomID,
		"content":       version.Content,
	})
}

func (a *API) VersionsRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/versions")

	// /api/versions or /api/versions/
	if path == "" || path == "/" {
		switch r.Method {
		case http.MethodGet:
			a.ListVersionsHandler(w, r)
		case http.MethodPost:
			a.CreateVersionHandler(w, r)
		default:
			errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		}
		return
	}

	// /api/versions/diff
	if strings.HasPrefix(path, "/diff") {
		a.DiffVersionsHandler(w, r)
		return
	}

	// /api/versions/{id}/restore
	if strings.HasSuffix(path, "/restore") {
		a.RestoreVersionHandler(w, r)
		return
	}

	// /api/versions/{id}
	switch r.Method {
	case http.MethodGet:
		a.GetVersionHandler(w, r)
	case http.MethodDelete:
		a.DeleteVersionHandler(w, r)
	default:
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
	}
}
