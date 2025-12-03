package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/manpreetbhatti/lattice/backend/internal/api"
	"github.com/manpreetbhatti/lattice/backend/internal/db"
	"github.com/manpreetbhatti/lattice/backend/internal/ws"
)

func main() {
	dbPath := os.Getenv("LATTICE_DB_PATH")
	if dbPath == "" {
		dbPath = "./data/lattice.db"
	}

	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	hub := ws.NewHub(database)
	go hub.Run()

	apiHandler := api.New(hub, database)

	// WebSocket endpoint
	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ws.ServeWs(hub, w, r)
	})

	http.HandleFunc("/health", apiHandler.HealthHandler)
	http.HandleFunc("/api/stats", apiHandler.StatsHandler)
	http.HandleFunc("/api/rooms", apiHandler.RoomsRouter)
	http.HandleFunc("/api/rooms/", apiHandler.RoomsRouter)
	http.HandleFunc("/api/versions", apiHandler.VersionsRouter)
	http.HandleFunc("/api/versions/", apiHandler.VersionsRouter)

	// Apply CORS middleware
	handler := corsMiddleware(http.DefaultServeMux)

	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		database.Close()
		os.Exit(0)
	}()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🌸 Lattice server starting on :%s", port)
	log.Printf("📁 Database: %s", dbPath)
	log.Println("Endpoints:")
	log.Println("  - WebSocket: /ws?room={roomId}")
	log.Println("  - Health:    GET /health")
	log.Println("  - Stats:     GET /api/stats")
	log.Println("  - Rooms:     GET/POST /api/rooms")
	log.Println("  - Room:      GET/DELETE /api/rooms/{id}")
	log.Println("  - Versions:  GET/POST /api/versions")
	log.Println("  - Version:   GET/DELETE /api/versions/{id}")
	log.Println("  - Diff:      GET /api/versions/diff?from=X&to=Y")
	log.Println("  - Restore:   POST /api/versions/{id}/restore")

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
