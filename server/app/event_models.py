"""
Pydantic event models shared by the WebSocket server and Kafka producer.

Every event flowing through the system is validated against these models,
ensuring a clean contract between client, server, and consumers.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class EventType(str, Enum):
    MOVE = "MOVE"
    SHOOT = "SHOOT"
    RESPAWN = "RESPAWN"
    HIT = "HIT"
    PLAYER_DIED = "PLAYER_DIED"
    GAME_STATE = "GAME_STATE"


# ── Inbound events (client → server) ─────────────────────────────────────────

class MoveEvent(BaseModel):
    type: EventType = EventType.MOVE
    playerId: str
    x: float
    y: float
    velocityX: float
    velocityY: float
    angle: float
    timestamp: int


class ShootEvent(BaseModel):
    type: EventType = EventType.SHOOT
    playerId: str
    x: float
    y: float
    angle: float
    timestamp: int


class RespawnEvent(BaseModel):
    type: EventType = EventType.RESPAWN
    playerId: str
    x: float
    y: float
    timestamp: int


# ── Outbound events (server → Kafka / server → client) ───────────────────────

class HitEvent(BaseModel):
    type: EventType = EventType.HIT
    playerId: str       # shooter
    targetId: str       # victim
    damage: int = 25
    timestamp: int


class PlayerDiedEvent(BaseModel):
    type: EventType = EventType.PLAYER_DIED
    playerId: str
    killedBy: Optional[str] = None
    timestamp: int


class PlayerState(BaseModel):
    """Snapshot of a single player's state."""
    id: str
    x: float
    y: float
    angle: float
    health: int
    kills: int
    alive: bool


class GameStateEvent(BaseModel):
    """Full game state broadcast sent to all connected clients."""
    type: EventType = EventType.GAME_STATE
    players: dict[str, PlayerState]
    timestamp: int
