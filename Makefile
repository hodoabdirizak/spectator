# Spectator — one-command developer workflow.
#
#   make install   — install SDK + player + seed dependencies
#   make build     — build SDK + player
#   make dev       — start server, demo, and player in parallel
#   make test      — run Go unit tests + player typecheck + SDK build
#   make seed      — generate realistic demo sessions
#   make pg        — boot the Postgres dev container
#   make clean     — remove build artifacts and caches
#   make fmt       — gofmt the server

.PHONY: install build dev server demo player test seed pg pg-down clean fmt help

help:
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\nTargets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install all JS dependencies
	cd sdk    && npm install
	cd player && npm install
	cd seed   && npm install

build: ## Build the SDK and the player
	cd sdk    && npm run build
	cd player && npm run build

dev: ## Run server, demo, and player concurrently (Ctrl-C to stop)
	@echo "Starting Spectator stack on :8080 (server), :4321 (demo), :5173 (player)…"
	@trap 'kill 0' INT; \
	(cd server && go run .) & \
	(cd sdk    && node server.js) & \
	(cd player && npm run dev) & \
	wait

server: ## Run only the Go server (in-memory store)
	cd server && go run .

demo: ## Run only the demo store
	cd sdk && node server.js

player: ## Run only the player
	cd player && npm run dev

test: ## Run all tests + typecheck + SDK build
	cd server && go test -race ./...
	cd player && npm run typecheck
	cd sdk    && npm run build

seed: ## Seed realistic sessions (defaults to 12)
	cd seed && node seed.js --sessions 12

seed-heavy: ## Seed 25 sessions
	cd seed && node seed.js --sessions 25

pg: ## Boot the Postgres dev container
	docker compose up -d
	@echo "Postgres up at postgres://spectator:spectator@localhost:5432/spectator"

pg-down: ## Stop the Postgres dev container (keeps the volume)
	docker compose down

fmt: ## gofmt the server
	cd server && gofmt -w .

clean: ## Remove build artifacts
	rm -rf sdk/dist player/dist server/spectator server/spectator-server
	@echo "Cleaned build artifacts."
