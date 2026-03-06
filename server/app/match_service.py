"""
Match and Room management service.

Handles:
  - Creating rooms
  - Joining/leaving rooms
  - Starting/ending matches
  - Match lifecycle events
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from app.event_models import MatchStartedEvent, MatchEndedEvent, PlayerJoinedEvent, PlayerLeftEvent


class MatchStatus(str, Enum):
    WAITING = "WAITING"      # Room created, waiting for players
    IN_PROGRESS = "IN_PROGRESS"  # Match started
    ENDED = "ENDED"          # Match finished


@dataclass
class Room:
    """Represents a game room/match."""
    id: str
    name: str
    host_id: str
    status: MatchStatus = MatchStatus.WAITING
    player_ids: list[str] = field(default_factory=list)
    max_players: int = 8
    min_players: int = 2
    created_at: int = field(default_factory=lambda: int(time.time() * 1000))
    started_at: Optional[int] = None
    ended_at: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "hostId": self.host_id,
            "status": self.status.value,
            "playerIds": self.player_ids,
            "playerCount": len(self.player_ids),
            "maxPlayers": self.max_players,
            "minPlayers": self.min_players,
            "createdAt": self.created_at,
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
        }


class MatchService:
    """Manages rooms and match lifecycle."""

    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        # Track which room each player is in
        self._player_room: dict[str, str] = {}

    def create_room(self, host_id: str, name: str, max_players: int = 8) -> Room:
        """Create a new room. Returns the room."""
        room_id = str(uuid.uuid4())[:8]  # Short ID for convenience
        room = Room(
            id=room_id,
            name=name,
            host_id=host_id,
            max_players=max_players,
            player_ids=[host_id],
        )
        self._rooms[room_id] = room
        self._player_room[host_id] = room_id
        return room

    def join_room(self, room_id: str, player_id: str) -> tuple[Room | None, str | None]:
        """
        Join a room. Returns (room, error).
        If successful, room is returned and error is None.
        If failed, room is None and error contains the reason.
        """
        room = self._rooms.get(room_id)
        if not room:
            return None, "Room not found"

        if room.status != MatchStatus.WAITING:
            return None, "Match already in progress"

        if len(room.player_ids) >= room.max_players:
            return None, "Room is full"

        if player_id in room.player_ids:
            return room, None  # Already in room

        # Leave current room if in one
        self.leave_room(player_id)

        room.player_ids.append(player_id)
        self._player_room[player_id] = room_id
        return room, None

    def leave_room(self, player_id: str) -> tuple[Room | None, bool]:
        """
        Leave current room. Returns (room, was_host).
        If player wasn't in a room, returns (None, False).
        """
        room_id = self._player_room.pop(player_id, None)
        if not room_id:
            return None, False

        room = self._rooms.get(room_id)
        if not room:
            return None, False

        was_host = room.host_id == player_id

        if player_id in room.player_ids:
            room.player_ids.remove(player_id)

        # If room is empty or host left, clean up
        if not room.player_ids:
            del self._rooms[room_id]
            return room, was_host

        # Transfer host if host left
        if was_host and room.player_ids:
            room.host_id = room.player_ids[0]

        return room, was_host

    def start_match(self, room_id: str, player_id: str) -> tuple[Room | None, str | None]:
        """
        Start a match. Only host can start. Returns (room, error).
        """
        room = self._rooms.get(room_id)
        if not room:
            return None, "Room not found"

        if room.host_id != player_id:
            return None, "Only host can start the match"

        if room.status != MatchStatus.WAITING:
            return None, "Match already started"

        if len(room.player_ids) < room.min_players:
            return None, f"Need at least {room.min_players} players to start"

        room.status = MatchStatus.IN_PROGRESS
        room.started_at = int(time.time() * 1000)
        return room, None

    def end_match(self, room_id: str) -> Room | None:
        """End a match. Returns the room or None if not found."""
        room = self._rooms.get(room_id)
        if not room:
            return None

        room.status = MatchStatus.ENDED
        room.ended_at = int(time.time() * 1000)
        return room

    def get_room(self, room_id: str) -> Room | None:
        """Get a room by ID."""
        return self._rooms.get(room_id)

    def get_player_room(self, player_id: str) -> Room | None:
        """Get the room a player is currently in."""
        room_id = self._player_room.get(player_id)
        if room_id:
            return self._rooms.get(room_id)
        return None

    def list_rooms(self, include_in_progress: bool = False) -> list[Room]:
        """List all available rooms."""
        rooms = []
        for room in self._rooms.values():
            if room.status == MatchStatus.WAITING:
                rooms.append(room)
            elif include_in_progress and room.status == MatchStatus.IN_PROGRESS:
                rooms.append(room)
        return rooms

    def get_room_players(self, room_id: str) -> list[str]:
        """Get player IDs in a room."""
        room = self._rooms.get(room_id)
        if room:
            return room.player_ids.copy()
        return []


# Module-level singleton
match_service = MatchService()
