# 2D Kafka Game

A **real-time multiplayer 2D shooter** inspired by Mini Militia, built with:

| Layer | Technology |
|---|---|
| Game client | Phaser.js + TypeScript + Vite |
| Backend | Python 3.11 · FastAPI · WebSockets |
| Event stream | Apache Kafka (KRaft) · aiokafka |
| Data models | Pydantic v2 |

---

## Quick Start

```bash
# Install all dependencies
make install

# Start Kafka (in background or separate terminal)
make kafka-start

# Create Kafka topic (first time only)
make kafka-setup

# Start server (terminal 1)
make run-server

# Start client (terminal 2)
make run-client
```

Open http://localhost:5173 in two browser tabs to play multiplayer.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Browser 1      │     │  Browser 2      │     │  Browser N      │
│  (Phaser.js)    │     │  (Phaser.js)    │     │  (Phaser.js)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │ WebSocket
                                 ▼
                    ┌────────────────────────┐
                    │   FastAPI Server       │
                    │                        │
                    │  • ConnectionManager   │
                    │  • MatchService        │
                    │  • GameStateManager    │
                    │                        │
                    │  broadcast (20 Hz) ────┼──► all clients
                    └───────────┬────────────┘
                                │
                                ▼
                    ┌────────────────────────┐
                    │   Kafka (game-events)  │
                    └───────────┬────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              ▼                 ▼                 ▼
      analytics_service   replay_service    (future consumers)
```

See [`docs/architecture.md`](docs/architecture.md) for detailed diagrams.

---

## Makefile Commands

```bash
make help             # Show all available commands

# Setup
make install          # Install all dependencies (server + client)
make install-server   # Install server dependencies with Poetry
make install-client   # Install client dependencies with npm

# Run services
make run-server       # FastAPI server on http://localhost:8000
make run-client       # Vite dev server on http://localhost:5173
make run-consumer     # Tail Kafka game-events topic

# Kafka (macOS)
make kafka-start      # Start Kafka in KRaft mode
make kafka-stop       # Stop Kafka
make kafka-setup      # Create game-events topic
make kafka-status     # Check if Kafka is running

# Development
make test             # Run server tests with pytest
make lint             # Run ruff linter
make clean            # Remove build artifacts
```

---

## Repository Structure

```
2D-KafkaGame/
├── Makefile                # Development commands
├── client/                 # Phaser.js TypeScript game
│   ├── src/
│   │   ├── main.ts
│   │   ├── types.ts        # Event type definitions
│   │   ├── scenes/
│   │   │   ├── MenuScene.ts
│   │   │   ├── LobbyScene.ts
│   │   │   └── GameScene.ts
│   │   ├── entities/
│   │   │   ├── Player.ts
│   │   │   └── Bullet.ts
│   │   ├── network/
│   │   │   └── WebSocketClient.ts
│   │   └── ui/
│   │       └── HUD.ts
│   └── package.json
│
├── server/                 # Python FastAPI backend
│   ├── app/
│   │   ├── main.py
│   │   ├── websocket_server.py
│   │   ├── game_state.py
│   │   ├── match_service.py
│   │   ├── event_models.py
│   │   └── kafka_producer.py
│   ├── services/
│   │   ├── analytics_service.py
│   │   └── replay_service.py
│   ├── tests/
│   └── pyproject.toml
│
├── infra/scripts/          # Kafka helper scripts
│   ├── start-kafka.sh
│   ├── stop-kafka.sh
│   ├── setup-kafka.sh
│   └── consume-events.sh
│
└── docs/
    ├── architecture.md
    ├── event_model.md
    └── networking.md
```

---

## Prerequisites

- **macOS** (Intel or Apple Silicon)
- Node.js >= 18
- Python >= 3.11
- [Poetry](https://python-poetry.org/docs/#installation)
- Apache Kafka >= 4.0 (via Homebrew)

```bash
# Install Kafka (uses KRaft mode, no ZooKeeper needed)
brew install kafka
```

---

## Manual Setup (without Makefile)

### 1. Start Kafka

```bash
# Start Kafka in KRaft mode (foreground)
./infra/scripts/start-kafka.sh

# Or run in background
nohup ./infra/scripts/start-kafka.sh &

# Create topic (first time only)
./infra/scripts/setup-kafka.sh
```

### 2. Run the Backend

```bash
cd server
poetry install
poetry run uvicorn app.main:app --reload --port 8000
```

WebSocket endpoint: `ws://localhost:8000/ws/<player-id>`

### 3. Run the Client

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

> **Custom backend URL:** set `VITE_WS_URL=ws://your-host:8000/ws` in `client/.env`

---

## How to Play

| Action | Control |
|--------|---------|
| Move | WASD |
| Aim | Mouse |
| Shoot | Left click |
| Scoreboard | Tab |
| Back to menu | Escape |

### Game Flow

1. **Menu** - Create a new room or join existing one
2. **Lobby** - Wait for players, host starts match
3. **Game** - Fight! Respawn after 3 seconds when killed
4. **Results** - Match ends, return to menu

---

## Testing

```bash
make test                    # Run all tests
make lint                    # Run ruff linter

# Or manually:
cd server
poetry run pytest -v
poetry run pytest tests/test_game_state.py -v  # Single file
```

---

## Event Schema

See [`docs/event_model.md`](docs/event_model.md) for complete documentation.

### Key Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `MOVE` | client → server | Player position update with seq number |
| `SHOOT` | client → server | Fire bullet at angle |
| `RESPAWN` | client → server | Player respawns |
| `GAME_STATE` | server → clients | Full state broadcast (20 Hz) |
| `PLAYER_KILLED` | server → clients | Kill notification for feed |
| `MATCH_STARTED` | server → clients | Match begins |
| `MATCH_ENDED` | server → clients | Match results |

### Example: GAME_STATE

```json
{
  "type": "GAME_STATE",
  "matchId": "room-abc123",
  "players": {
    "player-1": {
      "id": "player-1",
      "x": 1280,
      "y": 720,
      "angle": 1.57,
      "health": 75,
      "kills": 3,
      "alive": true,
      "lastProcessedSeq": 42
    }
  },
  "timestamp": 1709742000000
}
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](docs/architecture.md) | System design, component responsibilities |
| [event_model.md](docs/event_model.md) | All event types with examples |
| [networking.md](docs/networking.md) | WebSocket protocol, client prediction |

---

## Features

- [x] Phaser game client (movement, aiming, shooting, health, respawn)
- [x] WebSocket backend (FastAPI)
- [x] In-memory game state with hit detection
- [x] Client-side prediction with server reconciliation
- [x] Room-based matchmaking (create, join, leave rooms)
- [x] Lobby system with player list and host controls
- [x] Kafka event streaming (analytics, replay)
- [x] HUD (health bar, ammo, kills, kill feed, scoreboard)
- [x] Makefile for developer experience
- [ ] Persistent leaderboard *(future)*
- [ ] Spectator mode *(future)*
