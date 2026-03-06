"""
Tests for GameState — the in-memory authoritative game state.

These tests run without any Kafka or network dependencies.
"""

import time
import pytest

from app.event_models import MoveEvent, RespawnEvent, ShootEvent
from app.game_state import WORLD_HEIGHT, WORLD_WIDTH, GameState


@pytest.fixture()
def state() -> GameState:
    return GameState()


def _ts() -> int:
    return int(time.time() * 1000)


class TestAddRemovePlayer:
    def test_add_player_registers_state(self, state: GameState) -> None:
        ps = state.add_player("p1")
        assert ps.id == "p1"
        assert ps.alive is True
        assert ps.health == 100

    def test_remove_player_cleans_up(self, state: GameState) -> None:
        state.add_player("p1")
        state.remove_player("p1")
        assert state.get_player("p1") is None

    def test_spawn_within_world_bounds(self, state: GameState) -> None:
        for _ in range(20):
            ps = state.add_player("px")
            assert 0 <= ps.x <= WORLD_WIDTH
            assert 0 <= ps.y <= WORLD_HEIGHT
            state.remove_player("px")


class TestMoveEvent:
    def test_move_updates_position(self, state: GameState) -> None:
        state.add_player("p1")
        ev = MoveEvent(
            playerId="p1", x=500.0, y=300.0, velocityX=100.0, velocityY=0.0, angle=0.0, timestamp=_ts()
        )
        state.apply_move(ev)
        ps = state.get_player("p1")
        assert ps is not None
        assert ps.x == 500.0
        assert ps.y == 300.0

    def test_move_clamps_to_world_bounds(self, state: GameState) -> None:
        state.add_player("p1")
        ev = MoveEvent(
            playerId="p1", x=99999.0, y=-9999.0, velocityX=0.0, velocityY=0.0, angle=0.0, timestamp=_ts()
        )
        state.apply_move(ev)
        ps = state.get_player("p1")
        assert ps is not None
        assert ps.x <= WORLD_WIDTH
        assert ps.y >= 0

    def test_move_dead_player_ignored(self, state: GameState) -> None:
        ps = state.add_player("p1")
        ps.alive = False
        ev = MoveEvent(
            playerId="p1", x=1000.0, y=1000.0, velocityX=0.0, velocityY=0.0, angle=0.0, timestamp=_ts()
        )
        original_x = ps.x
        state.apply_move(ev)
        assert ps.x == original_x  # unchanged


class TestShootEvent:
    def test_shoot_hits_nearby_enemy(self, state: GameState) -> None:
        state.add_player("shooter")
        target = state.add_player("target")
        # Place target directly to the right
        target.x = 600.0
        target.y = 0.0

        ev = ShootEvent(playerId="shooter", x=0.0, y=0.0, angle=0.0, timestamp=_ts())
        # Manually set shooter position to origin
        shooter = state.get_player("shooter")
        assert shooter is not None
        shooter.x = 0.0
        shooter.y = 0.0

        hits = state.apply_shoot(ev)
        assert len(hits) == 1
        assert hits[0].targetId == "target"
        assert hits[0].damage == 25

    def test_shoot_misses_far_enemy(self, state: GameState) -> None:
        state.add_player("shooter")
        target = state.add_player("target")
        target.x = 1000.0
        target.y = 1000.0  # far off the bullet trajectory

        shooter = state.get_player("shooter")
        assert shooter is not None
        shooter.x = 0.0
        shooter.y = 0.0

        ev = ShootEvent(playerId="shooter", x=0.0, y=0.0, angle=0.0, timestamp=_ts())
        hits = state.apply_shoot(ev)
        assert hits == []

    def test_shoot_does_not_hit_self(self, state: GameState) -> None:
        state.add_player("p1")
        ps = state.get_player("p1")
        assert ps is not None
        ps.x = 0.0
        ps.y = 0.0

        ev = ShootEvent(playerId="p1", x=0.0, y=0.0, angle=0.0, timestamp=_ts())
        hits = state.apply_shoot(ev)
        assert all(h.targetId != "p1" for h in hits)


class TestRespawnEvent:
    def test_respawn_restores_health(self, state: GameState) -> None:
        ps = state.add_player("p1")
        ps.alive = False
        ps.health = 0

        ev = RespawnEvent(playerId="p1", x=500.0, y=500.0, timestamp=_ts())
        state.apply_respawn(ev)
        assert ps.alive is True
        assert ps.health == 100

    def test_respawn_updates_position(self, state: GameState) -> None:
        state.add_player("p1")
        ev = RespawnEvent(playerId="p1", x=800.0, y=600.0, timestamp=_ts())
        state.apply_respawn(ev)
        ps = state.get_player("p1")
        assert ps is not None
        assert ps.x == 800.0
        assert ps.y == 600.0


class TestSnapshot:
    def test_snapshot_includes_all_players(self, state: GameState) -> None:
        state.add_player("a")
        state.add_player("b")
        snap = state.snapshot()
        assert "a" in snap.players
        assert "b" in snap.players
