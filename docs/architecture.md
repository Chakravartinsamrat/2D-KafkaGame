# Architecture

## Overview

```
Browser (Phaser)
    │
    │  WebSocket (ws://localhost:8000/ws/<player-id>)
    ▼
FastAPI Server  ──────────────────────────────────────────────────────────────
    │                                                                         │
    │  GameState (in-memory)                                                  │
    │  ┌─────────────────────────────────────────────────────────────┐        │
    │  │  players: dict[id, PlayerState]                             │        │
    │  │  apply_move / apply_shoot / apply_respawn                   │        │
    │  └─────────────────────────────────────────────────────────────┘        │
    │                                                                         │
    │  broadcast loop (20 Hz) → all clients                                   │
    │                                                                         │
    │  KafkaProducer (aiokafka)                                               │
    │  └──► game-events topic (partitions=3, retention=24h)                   │
    │              │                                                          │
    │    ┌─────────┴──────────┐                                               │
    │    ▼                    ▼                                                │
    │  analytics_service    replay_service                                     │
    │  (consumer group)     (consumer group)                                   │
    └─────────────────────────────────────────────────────────────────────────┘
```

## Event Flow

1. Player presses WASD or clicks to shoot in the browser
2. Phaser `GameScene` sends a JSON event over WebSocket
3. FastAPI `websocket_server.py` validates the event (Pydantic)
4. `GameState` applies the mutation (position update, hit detection, etc.)
5. The event is published to Kafka (`game-events` topic)
6. The broadcast loop sends the full game state to **all** clients at 20 Hz
7. Kafka consumers (analytics, replay) receive events independently

## Key Design Decisions

| Decision | Rationale |
|---|---|
| In-memory game state | Simple, fast, no DB for MVP |
| Full state broadcast | Avoids delta synchronisation complexity for MVP |
| Kafka for events only | Decouples analytics/replay from the hot game loop |
| asyncio throughout | Single-threaded, no locking needed for shared state |
| Graceful Kafka degradation | Game runs even if Kafka is offline |
