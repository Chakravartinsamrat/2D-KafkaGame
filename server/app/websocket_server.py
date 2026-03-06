"""
WebSocket game server.

Handles:
  - Player connections / disconnections
  - Room and match management
  - Routing inbound client events to GameState
  - Broadcasting authoritative game state to all clients
  - Publishing events to Kafka for analytics and replay
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

from fastapi import WebSocket, WebSocketDisconnect

from app.event_models import (
    EventType,
    MatchEndedEvent,
    MatchStartedEvent,
    MoveEvent,
    PlayerJoinedEvent,
    PlayerLeftEvent,
    RespawnEvent,
    ShootEvent,
)
from app.game_state import GameState, game_state_manager
from app.kafka_producer import kafka_producer
from app.match_service import MatchService, MatchStatus, match_service

logger = logging.getLogger(__name__)

# How often to broadcast the full game state (seconds)
BROADCAST_INTERVAL = 0.05  # 20 Hz


class ConnectionManager:
    """Tracks active WebSocket connections and dispatches broadcasts."""

    def __init__(self) -> None:
        # player_id → WebSocket
        self._connections: dict[str, WebSocket] = {}
        # player_id → match_id (None = global/quick-play)
        self._player_match: dict[str, Optional[str]] = {}

    async def connect(self, player_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[player_id] = ws
        self._player_match[player_id] = None
        logger.info("Player connected: %s  (total: %d)", player_id, len(self._connections))

    def disconnect(self, player_id: str) -> None:
        self._connections.pop(player_id, None)
        self._player_match.pop(player_id, None)
        logger.info("Player disconnected: %s  (total: %d)", player_id, len(self._connections))

    def set_player_match(self, player_id: str, match_id: Optional[str]) -> None:
        """Associate player with a match."""
        self._player_match[player_id] = match_id

    def get_player_match(self, player_id: str) -> Optional[str]:
        """Get the match a player is in."""
        return self._player_match.get(player_id)

    def get_match_players(self, match_id: Optional[str]) -> list[str]:
        """Get all player IDs in a match."""
        return [pid for pid, mid in self._player_match.items() if mid == match_id]

    async def send_to_player(self, player_id: str, data: dict[str, Any]) -> bool:
        """Send JSON payload to a specific player. Returns True if successful."""
        ws = self._connections.get(player_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(data))
            return True
        except Exception:
            return False

    async def broadcast(
        self, data: dict[str, Any], exclude: str | None = None, match_id: Optional[str] = None
    ) -> None:
        """Send JSON payload to players in a match, optionally excluding one."""
        payload = json.dumps(data)
        dead: list[str] = []

        # Get players in the specified match
        target_players = [
            pid for pid, mid in self._player_match.items()
            if mid == match_id
        ]

        for pid in target_players:
            if pid == exclude:
                continue
            ws = self._connections.get(pid)
            if not ws:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(pid)

        for pid in dead:
            self._connections.pop(pid, None)
            self._player_match.pop(pid, None)

    async def broadcast_all(self, data: dict[str, Any], exclude: str | None = None) -> None:
        """Send JSON payload to ALL connected players."""
        payload = json.dumps(data)
        dead: list[str] = []

        for pid, ws in list(self._connections.items()):
            if pid == exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(pid)

        for pid in dead:
            self._connections.pop(pid, None)
            self._player_match.pop(pid, None)

    @property
    def player_ids(self) -> list[str]:
        return list(self._connections.keys())


# Module-level singletons
manager = ConnectionManager()


async def handle_player(player_id: str, websocket: WebSocket) -> None:
    """
    Main coroutine for a single WebSocket connection.

    Registers the player, then reads messages in a loop until the client
    disconnects. All inbound actions are validated, applied to game state,
    and published to Kafka.
    """
    await manager.connect(player_id, websocket)

    # Add to global game state by default (quick-play mode)
    game_state = game_state_manager.get_global()
    game_state.add_player(player_id)

    # Publish player joined event
    joined_event = PlayerJoinedEvent(
        matchId=None,
        playerId=player_id,
        timestamp=int(time.time() * 1000),
    )
    await kafka_producer.publish(joined_event.model_dump())

    try:
        while True:
            raw = await websocket.receive_text()
            await _process_message(player_id, raw)
    except WebSocketDisconnect:
        pass
    finally:
        # Handle player leaving
        match_id = manager.get_player_match(player_id)

        # Publish player left event
        left_event = PlayerLeftEvent(
            matchId=match_id,
            playerId=player_id,
            reason="disconnected",
            timestamp=int(time.time() * 1000),
        )
        await kafka_producer.publish(left_event.model_dump())

        # Remove from match service if in a room
        room, _ = match_service.leave_room(player_id)

        # Remove from game state
        game_state = game_state_manager.get(match_id) or game_state_manager.get_global()
        game_state.remove_player(player_id)

        manager.disconnect(player_id)


async def _process_message(player_id: str, raw: str) -> None:
    """Parse and dispatch a single inbound message."""
    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid JSON from %s", player_id)
        return

    event_type = data.get("type")
    match_id = manager.get_player_match(player_id)
    game_state = game_state_manager.get(match_id) or game_state_manager.get_global()

    # Inject match_id into event data
    data["matchId"] = match_id

    if event_type == EventType.MOVE:
        event = MoveEvent(**data)
        moved_event = game_state.apply_move(event)
        if moved_event:
            await kafka_producer.publish(moved_event.model_dump())

    elif event_type == EventType.SHOOT:
        event = ShootEvent(**data)
        shot_event, hit_events, kill_events = game_state.apply_shoot(event)

        # Broadcast shoot to other players so they see the bullet
        await manager.broadcast(event.model_dump(), exclude=player_id, match_id=match_id)

        # Broadcast kill events to all players for kill feed
        for kill in kill_events:
            await manager.broadcast(kill.model_dump(), match_id=match_id)

        # Publish to Kafka
        if shot_event:
            await kafka_producer.publish(shot_event.model_dump())
        for hit in hit_events:
            await kafka_producer.publish(hit.model_dump())
        for kill in kill_events:
            await kafka_producer.publish(kill.model_dump())

    elif event_type == EventType.RESPAWN:
        event = RespawnEvent(**data)
        game_state.apply_respawn(event)

    # Room management commands
    elif event_type == "CREATE_ROOM":
        await _handle_create_room(player_id, data)

    elif event_type == "JOIN_ROOM":
        await _handle_join_room(player_id, data)

    elif event_type == "LEAVE_ROOM":
        await _handle_leave_room(player_id)

    elif event_type == "START_MATCH":
        await _handle_start_match(player_id, data)

    elif event_type == "LIST_ROOMS":
        await _handle_list_rooms(player_id)

    else:
        logger.debug("Unknown event type '%s' from %s", event_type, player_id)


# ── Room management handlers ──────────────────────────────────────────────────

async def _handle_create_room(player_id: str, data: dict[str, Any]) -> None:
    """Handle CREATE_ROOM command."""
    name = data.get("name", f"Room-{player_id[:4]}")
    max_players = data.get("maxPlayers", 8)

    room = match_service.create_room(player_id, name, max_players)
    manager.set_player_match(player_id, room.id)

    # Create game state for this room
    game_state = game_state_manager.get_or_create(room.id)

    # Move player from global to room state
    global_state = game_state_manager.get_global()
    global_state.remove_player(player_id)
    game_state.add_player(player_id)

    await manager.send_to_player(player_id, {
        "type": "ROOM_CREATED",
        "room": room.to_dict(),
    })

    logger.info("Room created: %s by %s", room.id, player_id)


async def _handle_join_room(player_id: str, data: dict[str, Any]) -> None:
    """Handle JOIN_ROOM command."""
    room_id = data.get("roomId")
    if not room_id:
        await manager.send_to_player(player_id, {
            "type": "ERROR",
            "message": "roomId is required",
        })
        return

    room, error = match_service.join_room(room_id, player_id)
    if error:
        await manager.send_to_player(player_id, {
            "type": "ERROR",
            "message": error,
        })
        return

    manager.set_player_match(player_id, room_id)

    # Move player from global to room state
    game_state = game_state_manager.get_or_create(room_id)
    global_state = game_state_manager.get_global()
    global_state.remove_player(player_id)
    game_state.add_player(player_id)

    # Notify player
    await manager.send_to_player(player_id, {
        "type": "ROOM_JOINED",
        "room": room.to_dict(),
    })

    # Notify other players in room
    joined_event = PlayerJoinedEvent(
        matchId=room_id,
        playerId=player_id,
        timestamp=int(time.time() * 1000),
    )
    await manager.broadcast(joined_event.model_dump(), exclude=player_id, match_id=room_id)
    await kafka_producer.publish(joined_event.model_dump())

    logger.info("Player %s joined room %s", player_id, room_id)


async def _handle_leave_room(player_id: str) -> None:
    """Handle LEAVE_ROOM command."""
    current_match = manager.get_player_match(player_id)
    if not current_match:
        return

    room, was_host = match_service.leave_room(player_id)

    # Move player back to global state
    game_state = game_state_manager.get(current_match)
    if game_state:
        game_state.remove_player(player_id)

    global_state = game_state_manager.get_global()
    global_state.add_player(player_id)
    manager.set_player_match(player_id, None)

    # Notify player
    await manager.send_to_player(player_id, {
        "type": "ROOM_LEFT",
    })

    # Notify others in room
    if room and room.player_ids:
        left_event = PlayerLeftEvent(
            matchId=current_match,
            playerId=player_id,
            reason="quit",
            timestamp=int(time.time() * 1000),
        )
        await manager.broadcast(left_event.model_dump(), match_id=current_match)
        await kafka_producer.publish(left_event.model_dump())

        # Notify about new host if host left
        if was_host:
            await manager.broadcast({
                "type": "ROOM_UPDATE",
                "room": room.to_dict(),
            }, match_id=current_match)

    logger.info("Player %s left room %s", player_id, current_match)


async def _handle_start_match(player_id: str, data: dict[str, Any]) -> None:
    """Handle START_MATCH command."""
    room_id = data.get("roomId") or manager.get_player_match(player_id)
    if not room_id:
        await manager.send_to_player(player_id, {
            "type": "ERROR",
            "message": "Not in a room",
        })
        return

    room, error = match_service.start_match(room_id, player_id)
    if error:
        await manager.send_to_player(player_id, {
            "type": "ERROR",
            "message": error,
        })
        return

    # Reset all players in the match
    game_state = game_state_manager.get(room_id)
    if game_state:
        game_state.reset_all_players()

    # Publish match started event
    started_event = MatchStartedEvent(
        matchId=room_id,
        playerIds=room.player_ids,
        hostId=room.host_id,
        timestamp=int(time.time() * 1000),
    )
    await manager.broadcast(started_event.model_dump(), match_id=room_id)
    await kafka_producer.publish(started_event.model_dump())

    logger.info("Match started: %s", room_id)


async def _handle_list_rooms(player_id: str) -> None:
    """Handle LIST_ROOMS command."""
    rooms = match_service.list_rooms(include_in_progress=False)
    await manager.send_to_player(player_id, {
        "type": "ROOM_LIST",
        "rooms": [r.to_dict() for r in rooms],
    })


async def end_match(room_id: str, winner_id: Optional[str] = None) -> None:
    """End a match (called externally or by game logic)."""
    room = match_service.end_match(room_id)
    if not room:
        return

    game_state = game_state_manager.get(room_id)
    scores = game_state.get_scores() if game_state else {}
    duration = (room.ended_at - room.started_at) if room.started_at and room.ended_at else 0

    ended_event = MatchEndedEvent(
        matchId=room_id,
        playerIds=room.player_ids,
        winnerId=winner_id,
        scores=scores,
        durationMs=duration,
        timestamp=int(time.time() * 1000),
    )
    await manager.broadcast(ended_event.model_dump(), match_id=room_id)
    await kafka_producer.publish(ended_event.model_dump())

    # Clean up game state after a delay
    await asyncio.sleep(5)
    game_state_manager.remove(room_id)

    logger.info("Match ended: %s", room_id)


async def broadcast_loop() -> None:
    """
    Background task: broadcasts authoritative game state to all players
    at a fixed rate (BROADCAST_INTERVAL seconds).
    """
    while True:
        await asyncio.sleep(BROADCAST_INTERVAL)

        # Broadcast global state
        global_players = manager.get_match_players(None)
        if global_players:
            game_state = game_state_manager.get_global()
            snapshot = game_state.snapshot()
            await manager.broadcast(snapshot.model_dump(), match_id=None)

        # Broadcast state for each active match
        for room in match_service.list_rooms(include_in_progress=True):
            if room.status == MatchStatus.IN_PROGRESS:
                game_state = game_state_manager.get(room.id)
                if game_state and game_state.player_count > 0:
                    snapshot = game_state.snapshot()
                    await manager.broadcast(snapshot.model_dump(), match_id=room.id)
