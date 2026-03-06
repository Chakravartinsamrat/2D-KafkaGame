"""
Replay service — consumes game-events from Kafka and persists them
to a JSON file for future replay playback.

Run standalone:
    poetry run python -m services.replay_service
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

KAFKA_TOPIC = "game-events"
KAFKA_BOOTSTRAP = "localhost:9092"
KAFKA_GROUP = "replay-consumer"
REPLAY_DIR = Path("replays")

try:
    from aiokafka import AIOKafkaConsumer
    _KAFKA_AVAILABLE = True
except ImportError:
    _KAFKA_AVAILABLE = False


class ReplayRecorder:
    """Accumulates events and flushes them to a JSON file."""

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.events: list[dict[str, Any]] = []
        REPLAY_DIR.mkdir(exist_ok=True)

    def record(self, event: dict[str, Any]) -> None:
        self.events.append(event)

    def save(self) -> Path:
        path = REPLAY_DIR / f"replay_{self.session_id}.json"
        with path.open("w", encoding="utf-8") as fh:
            json.dump(
                {"session_id": self.session_id, "events": self.events},
                fh,
                indent=2,
            )
        logger.info("Replay saved to %s (%d events)", path, len(self.events))
        return path


async def run() -> None:
    if not _KAFKA_AVAILABLE:
        logger.error("aiokafka is not installed. Install it with: poetry add aiokafka")
        return

    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP,
        group_id=KAFKA_GROUP,
        value_deserializer=lambda m: json.loads(m.decode("utf-8")),
        auto_offset_reset="earliest",
    )

    session_id = str(int(time.time()))
    recorder = ReplayRecorder(session_id)

    await consumer.start()
    logger.info("Replay consumer started — session %s", session_id)
    try:
        async for msg in consumer:
            event = msg.value
            recorder.record(event)
            logger.debug("[Replay] recorded: %s", event.get("type"))
    except asyncio.CancelledError:
        pass
    finally:
        recorder.save()
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
