package compaction

import (
	"log"
	"sync"
	"time"

	"github.com/manpreetbhatti/lattice/backend/internal/db"
)

type Config struct {
	Interval          time.Duration
	UpdateThreshold   int
	KeepRecentUpdates int
}

func DefaultConfig() Config {
	return Config{
		Interval:          5 * time.Minute,
		UpdateThreshold:   100,
		KeepRecentUpdates: 10,
	}
}

type Service struct {
	database *db.Database
	config   Config
	stop     chan struct{}
	wg       sync.WaitGroup
}

func New(database *db.Database, config Config) *Service {
	return &Service{
		database: database,
		config:   config,
		stop:     make(chan struct{}),
	}
}

func (s *Service) Start() {
	s.wg.Add(1)
	go s.run()
	log.Printf("🗜️ Compaction service started (interval: %v, threshold: %d updates)",
		s.config.Interval, s.config.UpdateThreshold)
}

func (s *Service) Stop() {
	close(s.stop)
	s.wg.Wait()
	log.Println("🗜️ Compaction service stopped")
}

func (s *Service) run() {
	defer s.wg.Done()

	ticker := time.NewTicker(s.config.Interval)
	defer ticker.Stop()

	s.compactAllRooms()

	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			s.compactAllRooms()
		}
	}
}

func (s *Service) compactAllRooms() {
	rooms, err := s.database.ListRooms(1000, 0)
	if err != nil {
		log.Printf("Compaction: failed to list rooms: %v", err)
		return
	}

	compactedCount := 0
	for _, room := range rooms {
		if s.shouldCompact(room.ID) {
			if err := s.compactRoom(room.ID); err != nil {
				log.Printf("Compaction: failed for room %s: %v", room.ID, err)
			} else {
				compactedCount++
			}
		}
	}

	if compactedCount > 0 {
		log.Printf("🗜️ Compacted %d rooms", compactedCount)
	}
}

func (s *Service) shouldCompact(roomID string) bool {
	count, err := s.database.GetUpdateCount(roomID)
	if err != nil {
		return false
	}
	return count >= s.config.UpdateThreshold
}

func mergeYjsUpdates(updates [][]byte) []byte {
	totalSize := 0
	for _, update := range updates {
		totalSize += len(update)
	}

	merged := make([]byte, 0, totalSize+len(updates)*4)

	for _, update := range updates {
		length := uint32(len(update))
		merged = append(merged, byte(length>>24), byte(length>>16), byte(length>>8), byte(length))
		merged = append(merged, update...)
	}

	return merged
}

func (s *Service) compactRoom(roomID string) error {
	updates, err := s.database.GetAllUpdates(roomID)
	if err != nil {
		return err
	}

	if len(updates) < s.config.UpdateThreshold {
		return nil
	}

	mergedUpdate := mergeYjsUpdates(updates)

	if err := s.database.SaveSnapshot(roomID, mergedUpdate, len(updates)); err != nil {
		return err
	}

	if err := s.database.DeleteUpdatesBeforeSnapshot(roomID, s.config.KeepRecentUpdates); err != nil {
		return err
	}

	log.Printf("🗜️ Compacted room %s: %d updates → snapshot + %d recent",
		roomID, len(updates), s.config.KeepRecentUpdates)

	return nil
}

func SplitMergedUpdates(merged []byte) [][]byte {
	var updates [][]byte
	offset := 0

	for offset < len(merged) {
		if offset+4 > len(merged) {
			break
		}

		length := uint32(merged[offset])<<24 |
			uint32(merged[offset+1])<<16 |
			uint32(merged[offset+2])<<8 |
			uint32(merged[offset+3])
		offset += 4

		if offset+int(length) > len(merged) {
			break
		}

		update := make([]byte, length)
		copy(update, merged[offset:offset+int(length)])
		updates = append(updates, update)
		offset += int(length)
	}

	return updates
}

func (s *Service) CompactNow(roomID string) error {
	return s.compactRoom(roomID)
}
