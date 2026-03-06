"""
WebSocket game server.

Handles:
  - Player connections / disconnections
  - Routing inbound client events to GameState
  - Broadcasting authoritative game state to all clients
  - Publishing events to Kafka for analytics and replay
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.event_models import EventType, MoveEvent, RespawnEvent, ShootEvent
from app.game_state import GameState
from app.kafka_producer import kafka_producer

logger = logging.getLogger(__name__)

# How often to broadcast the full game state (seconds)
BROADCAST_INTERVAL = 0.05  # 20 Hz


class ConnectionManager:
    """Tracks active WebSocket connections and dispatches broadcasts."""

    def __init__(self) -> None:
        # player_id → WebSocket
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, player_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[player_id] = ws
        logger.info("Player connected: %s  (total: %d)", player_id, len(self._connections))

    def disconnect(self, player_id: str) -> None:
        self._connections.pop(player_id, None)
        logger.info("Player disconnected: %s  (total: %d)", player_id, len(self._connections))

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send JSON payload to every connected client."""
        payload = json.dumps(data)
        dead: list[str] = []
        for pid, ws in list(self._connections.items()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(pid)
        for pid in dead:
            self._connections.pop(pid, None)

    @property
    def player_ids(self) -> list[str]:
        return list(self._connections.keys())


# Module-level singletons
manager = ConnectionManager()
game_state = GameState()


async def handle_player(player_id: str, websocket: WebSocket) -> None:
    """
    Main coroutine for a single WebSocket connection.

    Registers the player, then reads messages in a loop until the client
    disconnects.  All inbound actions are validated, applied to game state,
    and published to Kafka.
    """
    await manager.connect(player_id, websocket)
    game_state.add_player(player_id)

    try:
        while True:
            raw = await websocket.receive_text()
            await _process_message(player_id, raw)
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(player_id)
        game_state.remove_player(player_id)


async def _process_message(player_id: str, raw: str) -> None:
    """Parse and dispatch a single inbound message."""
    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON from %s", player_id)
        return

    event_type = data.get("type")

    if event_type == EventType.MOVE:
        event = MoveEvent(**data)
        game_state.apply_move(event)
        await kafka_producer.publish(event.model_dump())

    elif event_type == EventType.SHOOT:
        event = ShootEvent(**data)
        hits = game_state.apply_shoot(event)
        await kafka_producer.publish(event.model_dump())
        for hit in hits:
            await kafka_producer.publish(hit.model_dump())

    elif event_type == EventType.RESPAWN:
        event = RespawnEvent(**data)
        game_state.apply_respawn(event)
        await kafka_producer.publish(event.model_dump())

    else:
        logger.debug("Unknown event type '%s' from %s", event_type, player_id)


async def broadcast_loop() -> None:
    """
    Background task: broadcasts authoritative game state to all players
    at a fixed rate (BROADCAST_INTERVAL seconds).
    """
    while True:
        await asyncio.sleep(BROADCAST_INTERVAL)
        if manager.player_ids:
            snapshot = game_state.snapshot()
            await manager.broadcast(snapshot.model_dump())
