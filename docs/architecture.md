# Architecture

This document describes the high-level architecture of the 2D Kafka Multiplayer Game.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              GAME CLIENTS                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Browser 1  │  │  Browser 2  │  │  Browser 3  │  │  Browser N  │        │
│  │  (Phaser)   │  │  (Phaser)   │  │  (Phaser)   │  │  (Phaser)   │        │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘        │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                   │                                          │
│                          WebSocket Connections                               │
│                    ws://localhost:8000/ws/<player-id>                        │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           GAME SERVER (FastAPI)                               │
│                                                                               │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │ ConnectionMgr   │    │   MatchService  │    │ GameStateManager│          │
│  │                 │    │                 │    │                 │          │
│  │ • Track sockets │◄──►│ • Room CRUD     │◄──►│ • Per-match     │          │
│  │ • Route msgs    │    │ • Match lifecycle│   │   game states   │          │
│  │ • Broadcasts    │    │ • Player mapping│    │ • Physics/hits  │          │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│           │                                              │                   │
│           │              ┌─────────────────┐             │                   │
│           └─────────────►│  Kafka Producer │◄────────────┘                   │
│                          │  (aiokafka)     │                                 │
│                          │  • Async publish│                                 │
│                          │  • Fire & forget│                                 │
│                          └────────┬────────┘                                 │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              APACHE KAFKA                                     │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     Topic: game-events (3 partitions)                   │ │
│  │                                                                         │ │
│  │  Partition 0: [MOVE][SHOOT][HIT][MOVE][PLAYER_KILLED]...               │ │
│  │  Partition 1: [MATCH_STARTED][MOVE][SHOOT][MOVE]...                    │ │
│  │  Partition 2: [PLAYER_JOINED][MOVE][HIT][MATCH_ENDED]...               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────┼──────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────┐
│   Analytics Service   │ │   Replay Service  │ │  Future Consumers │
│   (consumer group)    │ │   (consumer group)│ │                   │
│                       │ │                   │ │ • Leaderboards    │
│ • Player stats        │ │ • Match recording │ │ • Anti-cheat      │
│ • Heatmaps            │ │ • Playback        │ │ • Notifications   │
└───────────────────────┘ └───────────────────┘ └───────────────────┘
```

## Event Flow

```
Player Action (WASD/Mouse)
         │
         ▼
┌─────────────────┐
│  Client-side    │  1. Apply movement immediately (no wait for server)
│  Prediction     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  WebSocket Send │  2. Send MOVE/SHOOT event with sequence number
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Server Process │  3. Validate event (Pydantic), apply to GameState
└────────┬────────┘
         │
         ├──────────────────────┐
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│  Kafka Publish  │    │  State Broadcast │  4. Publish to Kafka (async)
│  (async)        │    │  (20 Hz loop)    │  5. Broadcast state to clients
└─────────────────┘    └────────┬─────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  All Clients    │  6. Clients reconcile with
                       │  Reconcile      │     server-authoritative state
                       └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │ Kafka Consumers │  7. Analytics/replay consume
                       │ (independent)   │     events independently
                       └─────────────────┘
```

## Component Responsibilities

### Client (Phaser.js)

| Component | File | Responsibility |
|-----------|------|----------------|
| MenuScene | `scenes/MenuScene.ts` | Main menu, room creation/joining |
| LobbyScene | `scenes/LobbyScene.ts` | Pre-match waiting room, player list |
| GameScene | `scenes/GameScene.ts` | Main gameplay, input handling, rendering |
| Player | `entities/Player.ts` | Player sprite, health bar, death/respawn |
| Bullet | `entities/Bullet.ts` | Projectile physics and lifecycle |
| HUD | `ui/HUD.ts` | Health, ammo, kills, scoreboard, kill feed |
| WebSocketClient | `network/WebSocketClient.ts` | Server connection, message handling |

### Server (FastAPI/Python)

| Component | File | Responsibility |
|-----------|------|----------------|
| websocket_server | `app/websocket_server.py` | Connection management, message routing |
| GameState | `app/game_state.py` | Authoritative game state, hit detection |
| MatchService | `app/match_service.py` | Room/match lifecycle management |
| KafkaProducer | `app/kafka_producer.py` | Async event publishing to Kafka |
| Event Models | `app/event_models.py` | Pydantic models for all event types |

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Server-authoritative | Prevents cheating, ensures consistency across clients |
| In-memory game state | Simple, fast, no DB for real-time gameplay |
| Full state broadcast | Avoids delta synchronisation complexity for MVP |
| Kafka for events only | Decouples analytics/replay from the hot game loop |
| asyncio throughout | Single-threaded, no locking needed for shared state |
| Graceful Kafka degradation | Game runs even if Kafka is offline |
| Client-side prediction | Eliminates perceived latency for player movement |
| Room-based isolation | Enables parallel matches with isolated state |

## World Configuration

| Parameter | Value | Location |
|-----------|-------|----------|
| World Width | 2560 px | `game_state.py`, `GameScene.ts` |
| World Height | 1440 px | `game_state.py`, `GameScene.ts` |
| Broadcast Rate | 20 Hz (50ms) | `websocket_server.py` |
| Player Speed | 200 px/s | `GameScene.ts` |
| Bullet Speed | 600 px/s | `Bullet.ts` |
| Bullet Damage | 25 HP | `game_state.py` |
| Player Health | 100 HP | `Player.ts`, `game_state.py` |
| Respawn Delay | 3 seconds | `GameScene.ts` |
