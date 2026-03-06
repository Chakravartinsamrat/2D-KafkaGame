# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time multiplayer 2D shooter game using Phaser.js (client) and FastAPI/Kafka (server). Players connect via WebSocket, and game events are streamed to Kafka for analytics and replay.

## Commands

Use the Makefile from the project root for common tasks:

```bash
make help             # Show all available commands

# Setup
make install          # Install all dependencies (server + client)

# Run services (each in separate terminal)
make run-server       # FastAPI WebSocket server (port 8000)
make run-client       # Vite dev server (port 5173)
make run-consumer     # Tail Kafka game-events topic

# Kafka (macOS with Homebrew)
make kafka-start      # Start Kafka in KRaft mode (foreground)
make kafka-stop       # Stop Kafka
make kafka-setup      # Create game-events topic
make kafka-status     # Check if Kafka is running

# Testing
make test             # Run all server tests
make lint             # Run ruff linter
```

### Manual Commands

Server (Python/FastAPI):
```bash
cd server
poetry install                              # Install dependencies
poetry run uvicorn app.main:app --reload    # Start server (http://localhost:8000)
poetry run pytest -v                        # Run tests
poetry run ruff check .                     # Lint code
```

Client (Phaser.js/Vite):
```bash
cd client
npm install           # Install dependencies
npm run dev           # Start dev server (http://localhost:5173)
npm run build         # Build for production
```

## Architecture

```
Browser (Phaser) ──WebSocket──► FastAPI Server ──► Kafka (game-events)
                                     │                    │
                               GameState (in-memory)    consumers
                                     │                (analytics, replay)
                              broadcast 20 Hz
                                     │
                              all clients
```

**Key design decisions:**
- Server-authoritative game state (in-memory, no DB)
- Full state broadcast at 20 Hz (no delta sync)
- asyncio single-threaded - no explicit locking needed
- Kafka decouples analytics/replay from game loop
- Game continues working if Kafka is offline

## Important Constants

World dimensions are defined in both client and server and **must match**:
- `server/app/game_state.py`: `WORLD_WIDTH = 2560`, `WORLD_HEIGHT = 1440`
- `client/src/scenes/GameScene.ts`: physics world bounds set to 2560x1440

## Event Types

Events flow: Player Input → WebSocket → GameState → Kafka → Consumers

| Event | Direction | Purpose |
|-------|-----------|---------|
| MOVE | client→server | Player position/velocity update |
| SHOOT | client→server | Fire bullet at angle |
| RESPAWN | client→server | Player respawns after death |
| HIT | server-internal | Bullet hit detection result |
| PLAYER_DIED | server-internal | Player health reached 0 |
| GAME_STATE | server→client | Full authoritative state broadcast |

## Testing

Tests use pytest-asyncio with `asyncio_mode = "auto"`. Run from server directory:
```bash
poetry run pytest -v                    # All tests
poetry run pytest tests/test_game_state.py -v  # Single file
```

## Custom Backend URL

Set `VITE_WS_URL` environment variable in `client/.env`:
```
VITE_WS_URL=ws://your-host:8000/ws
```
