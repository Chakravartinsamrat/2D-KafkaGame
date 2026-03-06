# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A real-time multiplayer 2D shooter game using Phaser.js (client) and FastAPI/Kafka (server). Players connect via WebSocket, and game events are streamed to Kafka for analytics and replay.

## Commands

### Server (Python/FastAPI)
```bash
cd server
poetry install                              # Install dependencies
poetry run uvicorn app.main:app --reload    # Start server (http://localhost:8000)
poetry run pytest -v                        # Run tests
poetry run python -m services.analytics_service  # Optional: analytics consumer
poetry run python -m services.replay_service     # Optional: replay consumer
```

### Client (Phaser.js/Vite)
```bash
cd client
npm install           # Install dependencies
npm run dev           # Start dev server (http://localhost:3000)
npm run build         # Build for production
```

### Kafka (local setup)
```bash
brew services start zookeeper && brew services start kafka
./infra/scripts/setup-kafka.sh    # Create game-events topic
./infra/scripts/consume-events.sh # Tail events for debugging
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
