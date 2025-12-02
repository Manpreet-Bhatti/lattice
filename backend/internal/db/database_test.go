package db

import (
	"os"
	"path/filepath"
	"testing"
)

func setupTestDB(t *testing.T) (*Database, func()) {
	t.Helper()

	tmpDir, err := os.MkdirTemp("", "lattice-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	dbPath := filepath.Join(tmpDir, "test.db")
	db, err := New(dbPath)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to create database: %v", err)
	}

	cleanup := func() {
		db.Close()
		os.RemoveAll(tmpDir)
	}

	return db, cleanup
}

func TestDatabaseCreation(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	if db == nil {
		t.Fatal("Database should not be nil")
	}
}

func TestRoomOperations(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	// Create room
	err := db.CreateRoom("test-room", "Test Room")
	if err != nil {
		t.Fatalf("Failed to create room: %v", err)
	}

	// Get room
	room, err := db.GetRoom("test-room")
	if err != nil {
		t.Fatalf("Failed to get room: %v", err)
	}
	if room == nil {
		t.Fatal("Room should exist")
	}
	if room.ID != "test-room" {
		t.Errorf("Expected room ID 'test-room', got '%s'", room.ID)
	}
	if room.Name != "Test Room" {
		t.Errorf("Expected room name 'Test Room', got '%s'", room.Name)
	}

	// Get non-existent room
	room, err = db.GetRoom("non-existent")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if room != nil {
		t.Error("Non-existent room should return nil")
	}

	err = db.DeleteRoom("test-room")
	if err != nil {
		t.Fatalf("Failed to delete room: %v", err)
	}

	// Verify deletion
	room, err = db.GetRoom("test-room")
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if room != nil {
		t.Error("Deleted room should not exist")
	}
}

func TestListRooms(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	for i := 0; i < 5; i++ {
		err := db.CreateRoom("room-"+string(rune('a'+i)), "Room "+string(rune('A'+i)))
		if err != nil {
			t.Fatalf("Failed to create room: %v", err)
		}
	}

	rooms, err := db.ListRooms(10, 0)
	if err != nil {
		t.Fatalf("Failed to list rooms: %v", err)
	}
	if len(rooms) != 5 {
		t.Errorf("Expected 5 rooms, got %d", len(rooms))
	}

	rooms, err = db.ListRooms(2, 0)
	if err != nil {
		t.Fatalf("Failed to list rooms: %v", err)
	}
	if len(rooms) != 2 {
		t.Errorf("Expected 2 rooms with limit, got %d", len(rooms))
	}

	rooms, err = db.ListRooms(2, 3)
	if err != nil {
		t.Fatalf("Failed to list rooms: %v", err)
	}
	if len(rooms) != 2 {
		t.Errorf("Expected 2 rooms with offset, got %d", len(rooms))
	}
}

func TestDocumentUpdates(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	roomID := "update-test-room"

	updates := [][]byte{
		{0, 1, 2, 3},
		{4, 5, 6, 7},
		{8, 9, 10, 11},
	}

	for _, update := range updates {
		err := db.SaveUpdate(roomID, update)
		if err != nil {
			t.Fatalf("Failed to save update: %v", err)
		}
	}

	// Get all updates
	retrieved, err := db.GetAllUpdates(roomID)
	if err != nil {
		t.Fatalf("Failed to get updates: %v", err)
	}
	if len(retrieved) != 3 {
		t.Errorf("Expected 3 updates, got %d", len(retrieved))
	}

	// Verify update content
	for i, update := range retrieved {
		for j, b := range update {
			if b != updates[i][j] {
				t.Errorf("Update %d byte %d mismatch: expected %d, got %d", i, j, updates[i][j], b)
			}
		}
	}

	// Get update count
	count, err := db.GetUpdateCount(roomID)
	if err != nil {
		t.Fatalf("Failed to get update count: %v", err)
	}
	if count != 3 {
		t.Errorf("Expected count 3, got %d", count)
	}
}

func TestSnapshots(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	roomID := "snapshot-test-room"
	err := db.CreateRoom(roomID, "Snapshot Test")
	if err != nil {
		t.Fatalf("Failed to create room: %v", err)
	}

	snapshotData := []byte{100, 101, 102, 103}
	err = db.SaveSnapshot(roomID, snapshotData, 10)
	if err != nil {
		t.Fatalf("Failed to save snapshot: %v", err)
	}

	retrieved, count, err := db.GetSnapshot(roomID)
	if err != nil {
		t.Fatalf("Failed to get snapshot: %v", err)
	}
	if count != 10 {
		t.Errorf("Expected update count 10, got %d", count)
	}
	if len(retrieved) != 4 {
		t.Errorf("Expected snapshot length 4, got %d", len(retrieved))
	}

	newSnapshotData := []byte{200, 201, 202}
	err = db.SaveSnapshot(roomID, newSnapshotData, 20)
	if err != nil {
		t.Fatalf("Failed to update snapshot: %v", err)
	}

	_, count, err = db.GetSnapshot(roomID)
	if err != nil {
		t.Fatalf("Failed to get updated snapshot: %v", err)
	}
	if count != 20 {
		t.Errorf("Expected update count 20, got %d", count)
	}
}

func TestStats(t *testing.T) {
	db, cleanup := setupTestDB(t)
	defer cleanup()

	for i := 0; i < 3; i++ {
		if err := db.CreateRoom("stats-room-"+string(rune('a'+i)), ""); err != nil {
			t.Fatalf("Failed to create room: %v", err)
		}
	}
	for i := 0; i < 5; i++ {
		if err := db.SaveUpdate("stats-room-a", []byte{byte(i)}); err != nil {
			t.Fatalf("Failed to save update: %v", err)
		}
	}

	stats, err := db.GetStats()
	if err != nil {
		t.Fatalf("Failed to get stats: %v", err)
	}

	if stats["room_count"].(int) != 3 {
		t.Errorf("Expected 3 rooms, got %v", stats["room_count"])
	}
	if stats["update_count"].(int) != 5 {
		t.Errorf("Expected 5 updates, got %v", stats["update_count"])
	}
}
