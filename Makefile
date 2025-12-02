.PHONY: help dev build up down logs clean test

help:
	@echo "🌸 Lattice - Development Commands"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development servers (no Docker)"
	@echo "  make dev-backend  - Start backend only"
	@echo "  make dev-frontend - Start frontend only"
	@echo ""
	@echo "Docker:"
	@echo "  make build        - Build Docker images"
	@echo "  make up           - Start all services"
	@echo "  make down         - Stop all services"
	@echo "  make logs         - View logs"
	@echo "  make clean        - Remove containers and volumes"
	@echo ""
	@echo "Production:"
	@echo "  make prod         - Start with production profile (includes nginx proxy)"
	@echo ""
	@echo "Utilities:"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linters"

# Development (without Docker)
dev:
	@echo "Starting development servers..."
	@make -j2 dev-backend dev-frontend

dev-backend:
	@echo "Starting backend..."
	cd backend && go run cmd/server/main.go

dev-frontend:
	@echo "Starting frontend..."
	cd frontend && npm run dev

# Docker commands
build:
	docker-compose build

up:
	docker-compose up -d
	@echo ""
	@echo "🌸 Lattice is running!"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:8080"
	@echo ""

down:
	docker-compose down

logs:
	docker-compose logs -f

logs-backend:
	docker-compose logs -f backend

logs-frontend:
	docker-compose logs -f frontend

# Production with nginx proxy
prod:
	docker-compose --profile production up -d
	@echo ""
	@echo "🌸 Lattice is running in production mode!"
	@echo "   App: http://localhost"
	@echo ""

clean:
	docker-compose down -v --remove-orphans
	docker system prune -f

test:
	@echo "Running backend tests..."
	cd backend && go test ./...
	@echo ""
	@echo "Running frontend tests..."
	cd frontend && npm test --passWithNoTests

lint:
	@echo "Linting backend..."
	cd backend && go vet ./...
	@echo ""
	@echo "Linting frontend..."
	cd frontend && npm run lint

# Database
db-reset:
	rm -f backend/data/lattice.db
	@echo "Database reset. Restart the backend to create a new one."

# Quick status check
status:
	@echo "Container Status:"
	@docker-compose ps
	@echo ""
	@echo "Health Check:"
	@curl -s http://localhost:8080/health | jq . 2>/dev/null || echo "Backend not responding"

