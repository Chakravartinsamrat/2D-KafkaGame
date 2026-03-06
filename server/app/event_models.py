"""
Pydantic event models shared by the WebSocket server and Kafka producer.

Every event flowing through the system is validated against these models,
ensuring a clean contract between client, server, and consumers.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel


class EventType(str, Enum):
    # Legacy events (still used internally)
    MOVE = "MOVE"
    SHOOT = "SHOOT"
    RESPAWN = "RESPAWN"
    HIT = "HIT"
    PLAYER_DIED = "PLAYER_DIED"
    GAME_STATE = "GAME_STATE"

    # New match lifecycle events
    PLAYER_JOINED = "PLAYER_JOINED"
    PLAYER_LEFT = "PLAYER_LEFT"
    MATCH_STARTED = "MATCH_STARTED"
    MATCH_ENDED = "MATCH_ENDED"

    # New gameplay events (for Kafka analytics)
    PLAYER_MOVED = "PLAYER_MOVED"
    PLAYER_SHOT = "PLAYER_SHOT"
    PLAYER_HIT = "PLAYER_HIT"
    PLAYER_KILLED = "PLAYER_KILLED"


# ── Base event with optional match context ────────────────────────────────────

class BaseEvent(BaseModel):
    """Base class for all events with optional match context."""
    matchId: Optional[str] = None
    timestamp: int


# ── Inbound events (client → server) ─────────────────────────────────────────

class MoveEvent(BaseEvent):
    type: EventType = EventType.MOVE
    playerId: str
    seq: int = 0  # Sequence number for client prediction reconciliation
    x: float
    y: float
    velocityX: float
    velocityY: float
    angle: float


class ShootEvent(BaseEvent):
    type: EventType = EventType.SHOOT
    playerId: str
    x: float
    y: float
    angle: float


class RespawnEvent(BaseEvent):
    type: EventType = EventType.RESPAWN
    playerId: str
    x: float
    y: float


# ── Match lifecycle events ────────────────────────────────────────────────────

class PlayerJoinedEvent(BaseEvent):
    """Published when a player joins a match/room."""
    type: EventType = EventType.PLAYER_JOINED
    playerId: str
    playerName: Optional[str] = None


class PlayerLeftEvent(BaseEvent):
    """Published when a player leaves a match/room."""
    type: EventType = EventType.PLAYER_LEFT
    playerId: str
    reason: str = "disconnected"  # disconnected, quit, kicked


class MatchStartedEvent(BaseEvent):
    """Published when a match begins."""
    type: EventType = EventType.MATCH_STARTED
    playerIds: list[str]
    hostId: str


class MatchEndedEvent(BaseEvent):
    """Published when a match ends."""
    type: EventType = EventType.MATCH_ENDED
    playerIds: list[str]
    winnerId: Optional[str] = None
    scores: dict[str, int] = {}
    durationMs: int = 0


# ── Gameplay events (for Kafka analytics) ─────────────────────────────────────

class PlayerMovedEvent(BaseEvent):
    """Published to Kafka when a player moves (analytics)."""
    type: EventType = EventType.PLAYER_MOVED
    playerId: str
    x: float
    y: float
    velocityX: float
    velocityY: float
    angle: float


class PlayerShotEvent(BaseEvent):
    """Published to Kafka when a player fires."""
    type: EventType = EventType.PLAYER_SHOT
    playerId: str
    x: float
    y: float
    angle: float


class PlayerHitEvent(BaseEvent):
    """Published when a bullet hits a player."""
    type: EventType = EventType.PLAYER_HIT
    playerId: str       # shooter
    targetId: str       # victim
    damage: int = 25
    targetHealthAfter: int = 0


class PlayerKilledEvent(BaseEvent):
    """Published when a player is killed."""
    type: EventType = EventType.PLAYER_KILLED
    playerId: str       # victim
    killedBy: Optional[str] = None
    killerKillCount: int = 0


# ── Legacy outbound events (kept for backwards compatibility) ─────────────────

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


# ── Game state broadcast ──────────────────────────────────────────────────────

class PlayerState(BaseModel):
    """Snapshot of a single player's state."""
    id: str
    x: float
    y: float
    angle: float
    health: int
    kills: int
    alive: bool
    lastProcessedSeq: int = 0  # Last input sequence processed by server


class GameStateEvent(BaseModel):
    """Full game state broadcast sent to all connected clients."""
    type: EventType = EventType.GAME_STATE
    matchId: Optional[str] = None
    players: dict[str, PlayerState]
    timestamp: int
