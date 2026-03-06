# Makefile for 2D-KafkaGame local development
#
# Prerequisites:
#   - Python 3.11+ with Poetry installed
#   - Node.js 18+ with npm
#   - Kafka installed via Homebrew (brew install kafka)

.PHONY: help install install-server install-client \
        run-server run-client run-consumer \
        kafka-start kafka-stop kafka-setup kafka-status \
        test lint clean

# Default target
help:
	@echo "2D-KafkaGame Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install all dependencies (server + client)"
	@echo "  make install-server   Install server dependencies with Poetry"
	@echo "  make install-client   Install client dependencies with npm"
	@echo ""
	@echo "Run:"
	@echo "  make run-server       Start the FastAPI WebSocket server (port 8000)"
	@echo "  make run-client       Start the Vite dev server (port 5173)"
	@echo "  make run-consumer     Tail Kafka game-events topic"
	@echo ""
	@echo "Kafka (macOS):"
	@echo "  make kafka-start      Start Kafka with KRaft mode"
	@echo "  make kafka-stop       Stop Kafka"
	@echo "  make kafka-setup      Create game-events topic"
	@echo "  make kafka-status     Check Kafka broker status"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run server tests with pytest"
	@echo "  make lint             Run linting (if configured)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            Remove build artifacts and caches"

# ─── Installation ───────────────────────────────────────────────────────────

install: install-server install-client
	@echo "All dependencies installed."

install-server:
	@echo "Installing server dependencies with Poetry..."
	cd server && poetry install

install-client:
	@echo "Installing client dependencies with npm..."
	cd client && npm install

# ─── Run Services ───────────────────────────────────────────────────────────

run-server:
	@echo "Starting FastAPI server on http://localhost:8000"
	cd server && poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

run-client:
	@echo "Starting Vite dev server on http://localhost:5173"
	cd client && npm run dev

run-consumer:
	@echo "Tailing Kafka game-events topic..."
	./infra/scripts/consume-events.sh

# ─── Kafka Management (macOS with Homebrew) ─────────────────────────────────

KAFKA_HOME ?= /opt/homebrew/opt/kafka
KAFKA_LOG_DIR ?= /tmp/kraft-combined-logs

kafka-start:
	@echo "Starting Kafka with KRaft mode..."
	./infra/scripts/start-kafka.sh

kafka-stop:
	@echo "Stopping Kafka..."
	./infra/scripts/stop-kafka.sh

kafka-setup:
	@echo "Setting up Kafka topics..."
	./infra/scripts/setup-kafka.sh

kafka-status:
	@echo "Checking Kafka status..."
	@$(KAFKA_HOME)/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 2>/dev/null \
		&& echo "Kafka is running on localhost:9092" \
		|| echo "Kafka is not running"

# ─── Testing ────────────────────────────────────────────────────────────────

test:
	@echo "Running server tests..."
	cd server && poetry run pytest -v

test-single:
	@echo "Usage: make test-single TEST=tests/test_game_state.py::test_add_player"
	cd server && poetry run pytest -v $(TEST)

# ─── Linting ────────────────────────────────────────────────────────────────

lint:
	@echo "Running ruff linter..."
	cd server && poetry run ruff check .

lint-fix:
	@echo "Running ruff with auto-fix..."
	cd server && poetry run ruff check --fix .

# ─── Cleanup ────────────────────────────────────────────────────────────────

clean:
	@echo "Cleaning build artifacts..."
	rm -rf client/dist client/node_modules/.vite
	find server -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find server -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find server -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	@echo "Clean complete."
