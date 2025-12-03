package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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
	stats := map[string]any{
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

type AICompleteRequest struct {
	Code      string `json:"code"`
	Language  string `json:"language"`
	CursorPos int    `json:"cursor_pos"`
	Prompt    string `json:"prompt,omitempty"`
	MaxTokens int    `json:"max_tokens,omitempty"`
	Provider  string `json:"provider,omitempty"` // "openai", "anthropic", "ollama"
}

type AICompleteResponse struct {
	Completion string `json:"completion"`
	StopReason string `json:"stop_reason,omitempty"`
}

type AIExplainRequest struct {
	Code     string `json:"code"`
	Language string `json:"language"`
}

type AIRefactorRequest struct {
	Code        string `json:"code"`
	Language    string `json:"language"`
	Instruction string `json:"instruction"`
}

func (a *API) AICompleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req AICompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Code == "" {
		errorResponse(w, http.StatusBadRequest, "code is required")
		return
	}

	if req.MaxTokens <= 0 {
		req.MaxTokens = 150
	}

	if req.Language == "" {
		req.Language = "javascript"
	}

	// Build the prompt for completion
	beforeCursor := req.Code[:req.CursorPos]
	afterCursor := ""
	if req.CursorPos < len(req.Code) {
		afterCursor = req.Code[req.CursorPos:]
	}

	systemPrompt := fmt.Sprintf(`You are a code completion assistant. Complete the code at the cursor position.
Rules:
- Only output the completion, no explanations
- Match the existing code style
- Be concise - complete the current statement or block
- Language: %s
- If there's code after cursor, make sure completion flows naturally into it`, req.Language)

	userPrompt := fmt.Sprintf("Complete this code at [CURSOR]:\n\n%s[CURSOR]%s", beforeCursor, afterCursor)
	if req.Prompt != "" {
		userPrompt = fmt.Sprintf("%s\n\nHint: %s", userPrompt, req.Prompt)
	}

	completion, err := callAIProvider(req.Provider, systemPrompt, userPrompt, req.MaxTokens)
	if err != nil {
		log.Printf("AI completion error: %v", err)
		errorResponse(w, http.StatusServiceUnavailable, "AI service unavailable")
		return
	}

	jsonResponse(w, http.StatusOK, AICompleteResponse{
		Completion: completion,
		StopReason: "complete",
	})
}

func (a *API) AIExplainHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req AIExplainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Code == "" {
		errorResponse(w, http.StatusBadRequest, "code is required")
		return
	}

	systemPrompt := `You are a code explanation assistant. Explain the given code clearly and concisely.
Include:
- What the code does
- Key concepts used
- Any potential issues or improvements`

	userPrompt := fmt.Sprintf("Explain this %s code:\n\n```%s\n%s\n```", req.Language, req.Language, req.Code)

	explanation, err := callAIProvider("", systemPrompt, userPrompt, 500)
	if err != nil {
		log.Printf("AI explain error: %v", err)
		errorResponse(w, http.StatusServiceUnavailable, "AI service unavailable")
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"explanation": explanation,
	})
}

func (a *API) AIRefactorHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		errorResponse(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req AIRefactorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		errorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Code == "" {
		errorResponse(w, http.StatusBadRequest, "code is required")
		return
	}

	if req.Instruction == "" {
		req.Instruction = "Improve this code"
	}

	systemPrompt := `You are a code refactoring assistant. Refactor the given code according to the instruction.
Rules:
- Only output the refactored code
- Preserve functionality unless asked to change it
- Follow best practices for the language`

	userPrompt := fmt.Sprintf("Refactor this %s code:\n\n```%s\n%s\n```\n\nInstruction: %s",
		req.Language, req.Language, req.Code, req.Instruction)

	refactored, err := callAIProvider("", systemPrompt, userPrompt, 1000)
	if err != nil {
		log.Printf("AI refactor error: %v", err)
		errorResponse(w, http.StatusServiceUnavailable, "AI service unavailable")
		return
	}

	// Extract code from markdown if present
	refactored = extractCodeFromMarkdown(refactored)

	jsonResponse(w, http.StatusOK, map[string]string{
		"refactored": refactored,
	})
}

func (a *API) AIRouter(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/ai")

	switch path {
	case "/complete", "/complete/":
		a.AICompleteHandler(w, r)
	case "/explain", "/explain/":
		a.AIExplainHandler(w, r)
	case "/refactor", "/refactor/":
		a.AIRefactorHandler(w, r)
	default:
		errorResponse(w, http.StatusNotFound, "AI endpoint not found")
	}
}

func callAIProvider(provider, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	openaiKey := getEnv("OPENAI_API_KEY", "")
	anthropicKey := getEnv("ANTHROPIC_API_KEY", "")
	ollamaURL := getEnv("OLLAMA_URL", "http://localhost:11434")

	if provider == "" {
		if openaiKey != "" {
			provider = "openai"
		} else if anthropicKey != "" {
			provider = "anthropic"
		} else {
			provider = "ollama"
		}
	}

	switch provider {
	case "openai":
		if openaiKey == "" {
			return "", fmt.Errorf("openai API key not set")
		}
		return callOpenAI(openaiKey, systemPrompt, userPrompt, maxTokens)
	case "anthropic":
		if anthropicKey == "" {
			return "", fmt.Errorf("anthropic API key not set")
		}
		return callAnthropic(anthropicKey, systemPrompt, userPrompt, maxTokens)
	case "ollama":
		return callOllama(ollamaURL, systemPrompt, userPrompt, maxTokens)
	default:
		return "", fmt.Errorf("unknown AI provider: %s", provider)
	}
}

func callOpenAI(apiKey, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	reqBody := map[string]any{
		"model": getEnv("OPENAI_MODEL", "gpt-4o-mini"),
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens":  maxTokens,
		"temperature": 0.3,
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("openai API error: %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no completion returned")
	}

	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}

func callAnthropic(apiKey, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	reqBody := map[string]any{
		"model":      getEnv("ANTHROPIC_MODEL", "claude-3-haiku-20240307"),
		"max_tokens": maxTokens,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": userPrompt},
		},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("anthropic API error: %d", resp.StatusCode)
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Content) == 0 {
		return "", fmt.Errorf("no completion returned")
	}

	return strings.TrimSpace(result.Content[0].Text), nil
}

func callOllama(baseURL, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	reqBody := map[string]any{
		"model":  getEnv("OLLAMA_MODEL", "codellama"),
		"prompt": fmt.Sprintf("%s\n\n%s", systemPrompt, userPrompt),
		"stream": false,
		"options": map[string]any{
			"num_predict": maxTokens,
			"temperature": 0.3,
		},
	}

	body, _ := json.Marshal(reqBody)
	req, _ := http.NewRequest("POST", baseURL+"/api/generate", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama not available at %s: %v (run 'ollama serve' first)", baseURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// Read error body for more details
		var errBody struct {
			Error string `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&errBody)
		if errBody.Error != "" {
			return "", fmt.Errorf("ollama error: %s (try 'ollama pull %s')", errBody.Error, getEnv("OLLAMA_MODEL", "codellama"))
		}
		return "", fmt.Errorf("ollama API error: %d", resp.StatusCode)
	}

	var result struct {
		Response string `json:"response"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return strings.TrimSpace(result.Response), nil
}

func extractCodeFromMarkdown(text string) string {
	if strings.HasPrefix(text, "```") {
		lines := strings.Split(text, "\n")
		var codeLines []string
		inCode := false
		for _, line := range lines {
			if strings.HasPrefix(line, "```") {
				inCode = !inCode
				continue
			}
			if inCode {
				codeLines = append(codeLines, line)
			}
		}
		if len(codeLines) > 0 {
			return strings.Join(codeLines, "\n")
		}
	}
	return text
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
