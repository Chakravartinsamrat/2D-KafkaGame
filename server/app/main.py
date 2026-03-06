"""
FastAPI application entry point.

Architecture summary:
  Client ──WebSocket──► FastAPI ──► GameState ──► Kafka (game-events topic)
                                        │
                                   broadcast loop
                                        │
                         all clients ◄──┘

Startup / shutdown hooks manage the Kafka producer lifecycle and the
background broadcast loop.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.kafka_producer import kafka_producer
from app.match_service import match_service
from app.websocket_server import broadcast_loop, handle_player

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start background tasks on startup; clean up on shutdown."""
    logger.info("Starting Kafka producer…")
    await kafka_producer.start()

    logger.info("Starting game state broadcast loop…")
    broadcast_task = asyncio.create_task(broadcast_loop())

    yield  # ← application is running

    logger.info("Shutting down…")
    broadcast_task.cancel()
    await kafka_producer.stop()


app = FastAPI(
    title="2D Kafka Game Server",
    description="Real-time multiplayer game server using FastAPI + Kafka",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the Vite dev server (localhost:3000) to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple health-check endpoint."""
    return {"status": "ok"}


@app.get("/rooms")
async def list_rooms(include_in_progress: bool = False) -> dict:
    """List available game rooms."""
    rooms = match_service.list_rooms(include_in_progress=include_in_progress)
    return {
        "rooms": [r.to_dict() for r in rooms],
    }


@app.get("/rooms/{room_id}")
async def get_room(room_id: str) -> dict:
    """Get details of a specific room."""
    room = match_service.get_room(room_id)
    if not room:
        return {"error": "Room not found"}
    return {"room": room.to_dict()}


@app.websocket("/ws/{player_id}")
async def websocket_endpoint(websocket: WebSocket, player_id: str) -> None:
    """
    WebSocket endpoint — one connection per player.
    The player_id is supplied by the client (a UUID generated in the browser).
    """
    await handle_player(player_id, websocket)
