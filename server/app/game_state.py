"""
In-memory game state manager.

Maintains the authoritative state for all connected players.
All mutations happen synchronously (protected by asyncio's single-threaded
event loop) so no explicit locking is needed.
"""

from __future__ import annotations

import random
from typing import Optional

from app.event_models import (
    GameStateEvent,
    HitEvent,
    MoveEvent,
    PlayerDiedEvent,
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
    """Holds and mutates game state for all active players."""

    def __init__(self) -> None:
        self._players: dict[str, PlayerState] = {}

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
        )
        self._players[player_id] = state
        return state

    def remove_player(self, player_id: str) -> None:
        self._players.pop(player_id, None)

    def get_player(self, player_id: str) -> Optional[PlayerState]:
        return self._players.get(player_id)

    # ── Event handlers ────────────────────────────────────────────────────────

    def apply_move(self, event: MoveEvent) -> None:
        player = self._players.get(event.playerId)
        if not player or not player.alive:
            return
        # Clamp to world bounds
        player.x = max(0.0, min(float(WORLD_WIDTH), event.x))
        player.y = max(0.0, min(float(WORLD_HEIGHT), event.y))
        player.angle = event.angle

    def apply_shoot(self, event: ShootEvent) -> list[HitEvent]:
        """
        Simplified hit detection: check if any enemy player is within 600 px
        along the bullet trajectory.  Returns HitEvents for each player hit.
        """
        shooter = self._players.get(event.playerId)
        if not shooter or not shooter.alive:
            return []

        import math

        hits: list[HitEvent] = []
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
                hit = HitEvent(
                    playerId=event.playerId,
                    targetId=pid,
                    damage=BULLET_DAMAGE,
                    timestamp=event.timestamp,
                )
                hits.append(hit)
                self._apply_damage(pid, BULLET_DAMAGE, event.playerId)

        return hits

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
        import time

        return GameStateEvent(
            players={pid: ps for pid, ps in self._players.items()},
            timestamp=int(time.time() * 1000),
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _apply_damage(
        self, target_id: str, damage: int, killer_id: str
    ) -> Optional[PlayerDiedEvent]:
        target = self._players.get(target_id)
        if not target:
            return None
        target.health = max(0, target.health - damage)
        if target.health == 0 and target.alive:
            target.alive = False
            killer = self._players.get(killer_id)
            if killer:
                killer.kills += 1
            import time

            return PlayerDiedEvent(
                playerId=target_id,
                killedBy=killer_id,
                timestamp=int(time.time() * 1000),
            )
        return None
