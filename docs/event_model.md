# Event Model

This document describes all event types flowing through the game system.

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT (Browser)                                  │
│                                                                              │
│   Player Input ──► MOVE, SHOOT, RESPAWN ──► WebSocket ──────────────────────┤
│                                                                              │
│   ◄─────────────── GAME_STATE, SHOOT, PLAYER_KILLED ◄── WebSocket ◄─────────┤
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SERVER (FastAPI)                                  │
│                                                                              │
│   Inbound Events                    Outbound Events                          │
│   ┌────────────┐                    ┌────────────────┐                      │
│   │ MOVE       │──► GameState ──────│ GAME_STATE     │──► All Clients       │
│   │ SHOOT      │    processing      │ SHOOT          │    (broadcast)       │
│   │ RESPAWN    │         │          │ PLAYER_KILLED  │                      │
│   └────────────┘         │          └────────────────┘                      │
│                          │                                                   │
│                          ▼                                                   │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                     Kafka Events (Analytics)                          │  │
│   │  PLAYER_JOINED, PLAYER_LEFT, MATCH_STARTED, MATCH_ENDED              │  │
│   │  PLAYER_MOVED, PLAYER_SHOT, PLAYER_HIT, PLAYER_KILLED                │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KAFKA (game-events topic)                            │
│                                                                              │
│   Consumers: analytics_service, replay_service, leaderboard, anti-cheat     │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Event Categories

### 1. Client → Server Events

Events sent by the game client to the server.

#### MOVE

Player position and velocity update.

```json
{
  "type": "MOVE",
  "playerId": "uuid-string",
  "seq": 42,
  "x": 1280.5,
  "y": 720.3,
  "velocityX": 200.0,
  "velocityY": 0.0,
  "angle": 1.57,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `seq` | int | Sequence number for client-side prediction reconciliation |
| `x`, `y` | float | Current position in world coordinates |
| `velocityX`, `velocityY` | float | Current velocity (px/s) |
| `angle` | float | Player facing direction (radians) |

#### SHOOT

Player fires a bullet.

```json
{
  "type": "SHOOT",
  "playerId": "uuid-string",
  "x": 1280.5,
  "y": 720.3,
  "angle": 1.57,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | float | Bullet spawn position (player position) |
| `angle` | float | Bullet direction (radians) |

#### RESPAWN

Player respawns after death.

```json
{
  "type": "RESPAWN",
  "playerId": "uuid-string",
  "x": 500.0,
  "y": 300.0,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | float | Respawn position (randomly selected by client) |

### 2. Server → Client Events

Events broadcast by the server to clients.

#### GAME_STATE

Full authoritative game state, broadcast at 20 Hz.

```json
{
  "type": "GAME_STATE",
  "matchId": "room-abc123",
  "players": {
    "player-1-uuid": {
      "id": "player-1-uuid",
      "x": 1280.5,
      "y": 720.3,
      "angle": 1.57,
      "health": 75,
      "kills": 3,
      "alive": true,
      "lastProcessedSeq": 42
    },
    "player-2-uuid": {
      "id": "player-2-uuid",
      "x": 500.0,
      "y": 300.0,
      "angle": 0.0,
      "health": 100,
      "kills": 1,
      "alive": true,
      "lastProcessedSeq": 38
    }
  },
  "timestamp": 1709742000000
}
```

| Field | Type | Description |
|-------|------|-------------|
| `players` | dict | Map of player ID to PlayerState |
| `lastProcessedSeq` | int | Last input sequence processed (for reconciliation) |

#### SHOOT (Broadcast)

Relayed to other players so they can render the bullet.

```json
{
  "type": "SHOOT",
  "playerId": "uuid-string",
  "x": 1280.5,
  "y": 720.3,
  "angle": 1.57,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

#### PLAYER_KILLED

Broadcast when a player dies (for kill feed).

```json
{
  "type": "PLAYER_KILLED",
  "playerId": "victim-uuid",
  "killedBy": "killer-uuid",
  "killerKillCount": 4,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

### 3. Match Lifecycle Events

Events for room/match management.

#### PLAYER_JOINED

```json
{
  "type": "PLAYER_JOINED",
  "playerId": "uuid-string",
  "playerName": "Player123",
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

#### PLAYER_LEFT

```json
{
  "type": "PLAYER_LEFT",
  "playerId": "uuid-string",
  "reason": "disconnected",
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

| `reason` values | Description |
|-----------------|-------------|
| `disconnected` | Connection lost |
| `quit` | Player left voluntarily |
| `kicked` | Removed by host (future) |

#### MATCH_STARTED

```json
{
  "type": "MATCH_STARTED",
  "matchId": "room-abc123",
  "playerIds": ["player-1", "player-2", "player-3"],
  "hostId": "player-1",
  "timestamp": 1709742000000
}
```

#### MATCH_ENDED

```json
{
  "type": "MATCH_ENDED",
  "matchId": "room-abc123",
  "playerIds": ["player-1", "player-2", "player-3"],
  "winnerId": "player-2",
  "scores": {
    "player-1": 5,
    "player-2": 8,
    "player-3": 3
  },
  "durationMs": 300000,
  "timestamp": 1709742000000
}
```

### 4. Kafka Analytics Events

Events published to Kafka for analytics and replay. Not sent to clients.

#### PLAYER_MOVED

```json
{
  "type": "PLAYER_MOVED",
  "playerId": "uuid-string",
  "x": 1280.5,
  "y": 720.3,
  "velocityX": 200.0,
  "velocityY": 0.0,
  "angle": 1.57,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

#### PLAYER_SHOT

```json
{
  "type": "PLAYER_SHOT",
  "playerId": "uuid-string",
  "x": 1280.5,
  "y": 720.3,
  "angle": 1.57,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

#### PLAYER_HIT

```json
{
  "type": "PLAYER_HIT",
  "playerId": "shooter-uuid",
  "targetId": "victim-uuid",
  "damage": 25,
  "targetHealthAfter": 50,
  "matchId": "room-abc123",
  "timestamp": 1709742000000
}
```

### 5. Room Management Events

Client commands for room management (not Pydantic models).

| Command | Fields | Description |
|---------|--------|-------------|
| `CREATE_ROOM` | `name`, `maxPlayers` | Host creates a new room |
| `JOIN_ROOM` | `roomId` | Player joins existing room |
| `LEAVE_ROOM` | - | Player leaves current room |
| `START_MATCH` | `roomId` | Host starts the match |
| `LIST_ROOMS` | - | Request list of available rooms |

#### Response Events

| Event | Fields | Description |
|-------|--------|-------------|
| `ROOM_CREATED` | `room` | Room created successfully |
| `ROOM_JOINED` | `room` | Joined room successfully |
| `ROOM_LEFT` | - | Left room |
| `ROOM_UPDATE` | `room` | Room state changed (new host, etc.) |
| `ROOM_LIST` | `rooms[]` | List of available rooms |
| `ERROR` | `message` | Error message |

## Pydantic Model Hierarchy

```
BaseEvent
├── matchId: Optional[str]
├── timestamp: int
│
├── MoveEvent (seq, playerId, x, y, velocityX, velocityY, angle)
├── ShootEvent (playerId, x, y, angle)
├── RespawnEvent (playerId, x, y)
│
├── PlayerJoinedEvent (playerId, playerName)
├── PlayerLeftEvent (playerId, reason)
├── MatchStartedEvent (playerIds, hostId)
├── MatchEndedEvent (playerIds, winnerId, scores, durationMs)
│
├── PlayerMovedEvent (playerId, x, y, velocityX, velocityY, angle)
├── PlayerShotEvent (playerId, x, y, angle)
├── PlayerHitEvent (playerId, targetId, damage, targetHealthAfter)
└── PlayerKilledEvent (playerId, killedBy, killerKillCount)

GameStateEvent (standalone)
├── type: GAME_STATE
├── matchId: Optional[str]
├── players: dict[str, PlayerState]
└── timestamp: int
```

## Event Validation

All events are validated using Pydantic models on the server:

```python
from app.event_models import MoveEvent

# Server receives raw JSON
data = json.loads(raw_message)

# Validate and parse
event = MoveEvent(**data)  # Raises ValidationError if invalid

# Access typed fields
print(event.playerId, event.x, event.y)
```

This ensures:
- Type safety (floats, ints, strings)
- Required field validation
- Default values applied
- Invalid events rejected early
