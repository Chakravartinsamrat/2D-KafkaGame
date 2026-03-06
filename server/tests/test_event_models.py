"""
Tests for Pydantic event models — validate serialisation and defaults.
"""

import pytest
from pydantic import ValidationError

from app.event_models import (
    EventType,
    GameStateEvent,
    HitEvent,
    MoveEvent,
    PlayerDiedEvent,
    PlayerState,
    RespawnEvent,
    ShootEvent,
)


def test_move_event_valid() -> None:
    ev = MoveEvent(playerId="abc", x=10.0, y=20.0, velocityX=5.0, velocityY=0.0, angle=1.2, timestamp=1000)
    assert ev.type == EventType.MOVE
    assert ev.playerId == "abc"


def test_shoot_event_valid() -> None:
    ev = ShootEvent(playerId="abc", x=0.0, y=0.0, angle=0.0, timestamp=2000)
    assert ev.type == EventType.SHOOT


def test_respawn_event_valid() -> None:
    ev = RespawnEvent(playerId="abc", x=100.0, y=200.0, timestamp=3000)
    assert ev.type == EventType.RESPAWN


def test_hit_event_defaults() -> None:
    ev = HitEvent(playerId="shooter", targetId="victim", timestamp=4000)
    assert ev.damage == 25
    assert ev.type == EventType.HIT


def test_player_died_event_optional_killer() -> None:
    ev = PlayerDiedEvent(playerId="victim", timestamp=5000)
    assert ev.killedBy is None


def test_game_state_event() -> None:
    ps = PlayerState(id="p1", x=1.0, y=2.0, angle=0.0, health=80, kills=2, alive=True)
    ev = GameStateEvent(players={"p1": ps}, timestamp=6000)
    assert ev.type == EventType.GAME_STATE
    assert ev.players["p1"].health == 80


def test_move_event_missing_field_raises() -> None:
    with pytest.raises(ValidationError):
        MoveEvent(playerId="abc", x=1.0)  # type: ignore[call-arg]


def test_event_model_serialises_to_dict() -> None:
    ev = MoveEvent(playerId="abc", x=10.0, y=20.0, velocityX=0.0, velocityY=0.0, angle=0.0, timestamp=7000)
    data = ev.model_dump()
    assert data["type"] == "MOVE"
    assert data["x"] == 10.0
