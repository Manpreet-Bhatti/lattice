package db

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Database struct {
	db *sql.DB
}

type Room struct {
	ID        string
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type DocumentState struct {
	RoomID    string
	Updates   []byte
	CreatedAt time.Time
	UpdatedAt time.Time
}

func New(dbPath string) (*Database, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, err
	}

	// Enable WAL mode for better concurrency
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, err
	}

	// Create tables
	if err := createTables(db); err != nil {
		return nil, err
	}

	log.Printf("Database initialized at %s", dbPath)
	return &Database{db: db}, nil
}

func createTables(db *sql.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS rooms (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS document_updates (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		room_id TEXT NOT NULL,
		update_data BLOB NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_document_updates_room_id ON document_updates(room_id);

	CREATE TABLE IF NOT EXISTS room_snapshots (
		room_id TEXT PRIMARY KEY,
		snapshot_data BLOB NOT NULL,
		update_count INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
	);
	`

	_, err := db.Exec(schema)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}

// Room operations

func (d *Database) CreateRoom(id, name string) error {
	_, err := d.db.Exec(
		"INSERT OR IGNORE INTO rooms (id, name) VALUES (?, ?)",
		id, name,
	)
	return err
}

func (d *Database) GetRoom(id string) (*Room, error) {
	row := d.db.QueryRow(
		"SELECT id, name, created_at, updated_at FROM rooms WHERE id = ?",
		id,
	)

	var room Room
	err := row.Scan(&room.ID, &room.Name, &room.CreatedAt, &room.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &room, nil
}

func (d *Database) ListRooms(limit, offset int) ([]Room, error) {
	rows, err := d.db.Query(
		"SELECT id, name, created_at, updated_at FROM rooms ORDER BY updated_at DESC LIMIT ? OFFSET ?",
		limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rooms []Room
	for rows.Next() {
		var room Room
		if err := rows.Scan(&room.ID, &room.Name, &room.CreatedAt, &room.UpdatedAt); err != nil {
			return nil, err
		}
		rooms = append(rooms, room)
	}
	return rooms, rows.Err()
}

func (d *Database) UpdateRoomTimestamp(id string) error {
	_, err := d.db.Exec(
		"UPDATE rooms SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
		id,
	)
	return err
}

func (d *Database) DeleteRoom(id string) error {
	_, err := d.db.Exec("DELETE FROM rooms WHERE id = ?", id)
	return err
}

// Document update operations

func (d *Database) SaveUpdate(roomID string, update []byte) error {
	// Ensure room exists
	if err := d.CreateRoom(roomID, ""); err != nil {
		return err
	}

	// Save the update
	_, err := d.db.Exec(
		"INSERT INTO document_updates (room_id, update_data) VALUES (?, ?)",
		roomID, update,
	)
	if err != nil {
		return err
	}

	// Update room timestamp
	return d.UpdateRoomTimestamp(roomID)
}

func (d *Database) GetAllUpdates(roomID string) ([][]byte, error) {
	rows, err := d.db.Query(
		"SELECT update_data FROM document_updates WHERE room_id = ? ORDER BY id ASC",
		roomID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var updates [][]byte
	for rows.Next() {
		var data []byte
		if err := rows.Scan(&data); err != nil {
			return nil, err
		}
		updates = append(updates, data)
	}
	return updates, rows.Err()
}

func (d *Database) GetUpdateCount(roomID string) (int, error) {
	var count int
	err := d.db.QueryRow(
		"SELECT COUNT(*) FROM document_updates WHERE room_id = ?",
		roomID,
	).Scan(&count)
	return count, err
}

// Snapshot operations (for compaction)

func (d *Database) SaveSnapshot(roomID string, snapshot []byte, updateCount int) error {
	_, err := d.db.Exec(`
		INSERT INTO room_snapshots (room_id, snapshot_data, update_count, updated_at)
		VALUES (?, ?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(room_id) DO UPDATE SET
			snapshot_data = excluded.snapshot_data,
			update_count = excluded.update_count,
			updated_at = CURRENT_TIMESTAMP
	`, roomID, snapshot, updateCount)
	return err
}

func (d *Database) GetSnapshot(roomID string) ([]byte, int, error) {
	var snapshot []byte
	var updateCount int
	err := d.db.QueryRow(
		"SELECT snapshot_data, update_count FROM room_snapshots WHERE room_id = ?",
		roomID,
	).Scan(&snapshot, &updateCount)
	if err == sql.ErrNoRows {
		return nil, 0, nil
	}
	return snapshot, updateCount, err
}

func (d *Database) DeleteUpdatesBeforeSnapshot(roomID string, keepCount int) error {
	// Delete old updates, keeping only the most recent ones after snapshot
	_, err := d.db.Exec(`
		DELETE FROM document_updates 
		WHERE room_id = ? AND id NOT IN (
			SELECT id FROM document_updates 
			WHERE room_id = ? 
			ORDER BY id DESC 
			LIMIT ?
		)
	`, roomID, roomID, keepCount)
	return err
}

// Stats

func (d *Database) GetStats() (map[string]interface{}, error) {
	stats := make(map[string]interface{})

	var roomCount int
	if err := d.db.QueryRow("SELECT COUNT(*) FROM rooms").Scan(&roomCount); err != nil {
		return nil, err
	}
	stats["room_count"] = roomCount

	var updateCount int
	if err := d.db.QueryRow("SELECT COUNT(*) FROM document_updates").Scan(&updateCount); err != nil {
		return nil, err
	}
	stats["update_count"] = updateCount

	return stats, nil
}
