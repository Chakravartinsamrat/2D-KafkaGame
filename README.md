# 2D Kafka Game 🎮

A **real-time multiplayer 2D shooter** inspired by Mini Militia, built with:

| Layer | Technology |
|---|---|
| Game client | Phaser.js + TypeScript + Vite |
| Backend | Python 3.11 · FastAPI · WebSockets |
| Event stream | Apache Kafka · aiokafka |
| Data models | Pydantic v2 |

---

## Architecture

```
Browser (Phaser)
    │
    │  WebSocket
    ▼
FastAPI Server ──► GameState (in-memory)
    │                    │
    │              broadcast (20 Hz) ──► all clients
    │
    └──► Kafka (game-events)
              │
    ┌─────────┴──────────┐
    ▼                    ▼
analytics_service    replay_service
```

**Event flow:**

```
Player Input → WebSocket Server → GameState → Kafka Topic → Consumers
                                      │
                               state broadcast
                                      │
                             all connected clients
```

See [`docs/architecture.md`](docs/architecture.md) for a detailed breakdown.

---

## Repository Structure

```
2D-KafkaGame/
├── client/                 # Phaser.js TypeScript game
│   ├── src/
│   │   ├── main.ts         # Phaser game bootstrap
│   │   ├── types.ts        # Shared event type definitions
│   │   ├── scenes/
│   │   │   ├── MenuScene.ts
│   │   │   └── GameScene.ts
│   │   ├── entities/
│   │   │   ├── Player.ts
│   │   │   └── Bullet.ts
│   │   ├── network/
│   │   │   └── WebSocketClient.ts
│   │   └── ui/
│   │       └── HUD.ts
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── server/                 # Python FastAPI backend
│   ├── app/
│   │   ├── main.py         # FastAPI app + lifespan hooks
│   │   ├── websocket_server.py
│   │   ├── game_state.py
│   │   ├── event_models.py
│   │   └── kafka_producer.py
│   ├── services/
│   │   ├── analytics_service.py
│   │   └── replay_service.py
│   ├── tests/
│   │   ├── test_game_state.py
│   │   └── test_event_models.py
│   └── pyproject.toml
│
├── infra/                  # Kafka config & helper scripts
│   ├── game-topics.properties
│   └── scripts/
│       ├── setup-kafka.sh
│       └── consume-events.sh
│
└── docs/
    └── architecture.md
```

---

## Prerequisites

- **macOS** (Intel or Apple Silicon)
- Node.js ≥ 18
- Python ≥ 3.11
- [Poetry](https://python-poetry.org/docs/#installation)
- Apache Kafka (via Homebrew)

---

## 1 — Start Kafka Locally

```bash
# Install once
brew install kafka

# Start services
brew services start zookeeper
brew services start kafka

# Create the game-events topic
./infra/scripts/setup-kafka.sh
```

To tail events while the game is running:

```bash
./infra/scripts/consume-events.sh
```

---

## 2 — Run the Backend

```bash
cd server

# Install dependencies
poetry install

# Start the server (hot-reload enabled)
poetry run uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.  
WebSocket endpoint: `ws://localhost:8000/ws/<player-id>`

Health check: `curl http://localhost:8000/health`

### Optional: Run event consumers

```bash
# In separate terminals:
poetry run python -m services.analytics_service
poetry run python -m services.replay_service
```

---

## 3 — Run the Phaser Client

```bash
cd client

# Install dependencies
npm install

# Start the Vite dev server
npm run dev
```

Open your browser at `http://localhost:3000`.

> **Custom backend URL:** set `VITE_WS_URL=ws://your-host:8000/ws` in `client/.env`

---

## 4 — Play!

| Action | Control |
|---|---|
| Move | WASD |
| Aim | Mouse |
| Shoot | Left click |
| Back to menu | Escape |

Open two browser tabs to see multiplayer in action.

---

## 5 — Run Tests

```bash
cd server
poetry run pytest -v
```

---

## Event Schema

All events share a common structure:

```json
{
  "type": "MOVE | SHOOT | RESPAWN | HIT | PLAYER_DIED | GAME_STATE",
  "playerId": "uuid",
  "timestamp": 1234567890
}
```

### MOVE

```json
{
  "type": "MOVE",
  "playerId": "uuid",
  "x": 100,
  "y": 200,
  "velocityX": 200,
  "velocityY": 0,
  "angle": 1.57,
  "timestamp": 1234567890
}
```

### SHOOT

```json
{
  "type": "SHOOT",
  "playerId": "uuid",
  "x": 100,
  "y": 200,
  "angle": 0.785,
  "timestamp": 1234567890
}
```

### GAME_STATE (server → clients)

```json
{
  "type": "GAME_STATE",
  "players": {
    "uuid": { "id": "uuid", "x": 100, "y": 200, "angle": 0, "health": 80, "kills": 2, "alive": true }
  },
  "timestamp": 1234567890
}
```

---

## Replay Files

After running `replay_service`, match recordings are saved to `server/replays/`:

```json
{
  "session_id": "1710000000",
  "events": [
    { "type": "MOVE", "playerId": "...", ... },
    ...
  ]
}
```

---

## MVP Scope

- [x] Phaser game client (movement, aiming, shooting, health, respawn)
- [x] WebSocket backend (FastAPI)
- [x] In-memory game state with hit detection
- [x] Kafka event producer (MOVE, SHOOT, HIT, PLAYER_DIED, RESPAWN)
- [x] Kafka analytics consumer
- [x] Kafka replay consumer (saves JSON)
- [x] HUD (health bar, ammo, kill counter)
- [x] Menu scene
- [ ] Matchmaking *(future)*
- [ ] Advanced physics *(future)*
- [ ] Persistent leaderboard *(future)*
