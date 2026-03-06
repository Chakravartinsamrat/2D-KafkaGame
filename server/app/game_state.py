"""
In-memory game state manager.

Maintains the authoritative state for all connected players.
All mutations happen synchronously (protected by asyncio's single-threaded
event loop) so no explicit locking is needed.

Supports match isolation - each match has its own GameState.
"""

from __future__ import annotations

import math
import random
import time
from typing import Optional

from app.event_models import (
    GameStateEvent,
    HitEvent,
    MoveEvent,
    PlayerDiedEvent,
    PlayerHitEvent,
    PlayerKilledEvent,
    PlayerMovedEvent,
    PlayerShotEvent,
    PlayerState,
    RespawnEvent,
    ShootEvent,
)

# World dimensions must match the client constants
WORLD_WIDTH = 2560
WORLD_HEIGHT = 1440
BULLET_DAMAGE = 25
MAX_HEALTH = 100


class GameState:
    """Holds and mutates game state for a single match."""

    def __init__(self, match_id: Optional[str] = None) -> None:
        self._match_id = match_id
        self._players: dict[str, PlayerState] = {}

    @property
    def match_id(self) -> Optional[str]:
        return self._match_id

    @property
    def player_count(self) -> int:
        return len(self._players)

    @property
    def player_ids(self) -> list[str]:
        return list(self._players.keys())

    # ── Player lifecycle ──────────────────────────────────────────────────────

    def add_player(self, player_id: str) -> PlayerState:
        """Register a new player at a random spawn location."""
        state = PlayerState(
            id=player_id,
            x=random.uniform(200, WORLD_WIDTH - 200),
            y=random.uniform(200, WORLD_HEIGHT - 200),
            angle=0.0,
            health=MAX_HEALTH,
            kills=0,
            alive=True,
            lastProcessedSeq=0,
        )
        self._players[player_id] = state
        return state

    def remove_player(self, player_id: str) -> None:
        self._players.pop(player_id, None)

    def get_player(self, player_id: str) -> Optional[PlayerState]:
        return self._players.get(player_id)

    def has_player(self, player_id: str) -> bool:
        return player_id in self._players

    def reset_all_players(self) -> None:
        """Reset all players to initial state for a new match."""
        for player in self._players.values():
            player.x = random.uniform(200, WORLD_WIDTH - 200)
            player.y = random.uniform(200, WORLD_HEIGHT - 200)
            player.angle = 0.0
            player.health = MAX_HEALTH
            player.kills = 0
            player.alive = True
            player.lastProcessedSeq = 0

    # ── Event handlers ────────────────────────────────────────────────────────

    def apply_move(self, event: MoveEvent) -> Optional[PlayerMovedEvent]:
        """Apply move and return analytics event."""
        player = self._players.get(event.playerId)
        if not player or not player.alive:
            return None
        # Clamp to world bounds
        player.x = max(0.0, min(float(WORLD_WIDTH), event.x))
        player.y = max(0.0, min(float(WORLD_HEIGHT), event.y))
        player.angle = event.angle
        # Track the last processed input sequence for client reconciliation
        player.lastProcessedSeq = event.seq

        # Return analytics event for Kafka
        return PlayerMovedEvent(
            matchId=self._match_id,
            playerId=event.playerId,
            x=player.x,
            y=player.y,
            velocityX=event.velocityX,
            velocityY=event.velocityY,
            angle=player.angle,
            timestamp=event.timestamp,
        )

    def apply_shoot(self, event: ShootEvent) -> tuple[Optional[PlayerShotEvent], list[PlayerHitEvent], list[PlayerKilledEvent]]:
        """
        Simplified hit detection: check if any enemy player is within 600 px
        along the bullet trajectory.
        Returns (shot_event, hit_events, kill_events) for Kafka.
        """
        shooter = self._players.get(event.playerId)
        if not shooter or not shooter.alive:
            return None, [], []

        shot_event = PlayerShotEvent(
            matchId=self._match_id,
            playerId=event.playerId,
            x=event.x,
            y=event.y,
            angle=event.angle,
            timestamp=event.timestamp,
        )

        hits: list[PlayerHitEvent] = []
        kills: list[PlayerKilledEvent] = []

        dx = math.cos(event.angle)
        dy = math.sin(event.angle)

        for pid, target in self._players.items():
            if pid == event.playerId or not target.alive:
                continue
            # Vector from shooter to target
            tx = target.x - event.x
            ty = target.y - event.y
            # Project onto bullet direction
            proj = tx * dx + ty * dy
            if proj < 0 or proj > 600:
                continue
            # Perpendicular distance
            perp = abs(tx * dy - ty * dx)
            if perp < 20:  # hit radius
                kill_event = self._apply_damage(pid, BULLET_DAMAGE, event.playerId, event.timestamp)

                hit_event = PlayerHitEvent(
                    matchId=self._match_id,
                    playerId=event.playerId,
                    targetId=pid,
                    damage=BULLET_DAMAGE,
                    targetHealthAfter=target.health,
                    timestamp=event.timestamp,
                )
                hits.append(hit_event)

                if kill_event:
                    kills.append(kill_event)

        return shot_event, hits, kills

    def apply_respawn(self, event: RespawnEvent) -> None:
        player = self._players.get(event.playerId)
        if not player:
            return
        player.alive = True
        player.health = MAX_HEALTH
        player.x = max(0.0, min(float(WORLD_WIDTH), event.x))
        player.y = max(0.0, min(float(WORLD_HEIGHT), event.y))

    # ── Snapshots ─────────────────────────────────────────────────────────────

    def snapshot(self) -> GameStateEvent:
        return GameStateEvent(
            matchId=self._match_id,
            players={pid: ps for pid, ps in self._players.items()},
            timestamp=int(time.time() * 1000),
        )

    def get_scores(self) -> dict[str, int]:
        """Get kill scores for all players."""
        return {pid: ps.kills for pid, ps in self._players.items()}

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _apply_damage(
        self, target_id: str, damage: int, killer_id: str, timestamp: int
    ) -> Optional[PlayerKilledEvent]:
        target = self._players.get(target_id)
        if not target:
            return None
        target.health = max(0, target.health - damage)
        if target.health == 0 and target.alive:
            target.alive = False
            killer = self._players.get(killer_id)
            killer_kills = 0
            if killer:
                killer.kills += 1
                killer_kills = killer.kills

            return PlayerKilledEvent(
                matchId=self._match_id,
                playerId=target_id,
                killedBy=killer_id,
                killerKillCount=killer_kills,
                timestamp=timestamp,
            )
        return None


class GameStateManager:
    """Manages multiple GameState instances for different matches."""

    def __init__(self) -> None:
        # match_id → GameState (None key for global/lobby state)
        self._states: dict[Optional[str], GameState] = {
            None: GameState()  # Default global state for quick-play
        }

    def get_or_create(self, match_id: Optional[str] = None) -> GameState:
        """Get or create a GameState for a match."""
        if match_id not in self._states:
            self._states[match_id] = GameState(match_id)
        return self._states[match_id]

    def get(self, match_id: Optional[str] = None) -> Optional[GameState]:
        """Get GameState for a match, or None if not found."""
        return self._states.get(match_id)

    def remove(self, match_id: str) -> None:
        """Remove a match's GameState."""
        self._states.pop(match_id, None)

    def get_global(self) -> GameState:
        """Get the global/default GameState."""
        return self._states[None]


# Module-level singleton for backwards compatibility
game_state_manager = GameStateManager()
