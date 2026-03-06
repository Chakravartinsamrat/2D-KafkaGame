"""
Analytics service — consumes game-events from Kafka and computes
lightweight in-memory statistics.

Run standalone:
    poetry run python -m services.analytics_service
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any

logger = logging.getLogger(__name__)

KAFKA_TOPIC = "game-events"
KAFKA_BOOTSTRAP = "localhost:9092"
KAFKA_GROUP = "analytics-consumer"

try:
    from aiokafka import AIOKafkaConsumer
    _KAFKA_AVAILABLE = True
except ImportError:
    _KAFKA_AVAILABLE = False


class AnalyticsConsumer:
    """Simple analytics consumer — tracks per-player hit counts and shots."""

    def __init__(self) -> None:
        self.hits: dict[str, int] = defaultdict(int)
        self.shots: dict[str, int] = defaultdict(int)
        self.moves: dict[str, int] = defaultdict(int)

    def process(self, event: dict[str, Any]) -> None:
        etype = event.get("type")
        pid = event.get("playerId", "unknown")

        if etype == "SHOOT":
            self.shots[pid] += 1
        elif etype == "HIT":
            self.hits[pid] += 1
        elif etype == "MOVE":
            self.moves[pid] += 1

        logger.info("[Analytics] %s | hits=%s shots=%s", etype, dict(self.hits), dict(self.shots))

    def summary(self) -> dict[str, Any]:
        return {
            "hits": dict(self.hits),
            "shots": dict(self.shots),
            "moves": dict(self.moves),
        }


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
    analytics = AnalyticsConsumer()

    await consumer.start()
    logger.info("Analytics consumer started — listening on '%s'", KAFKA_TOPIC)
    try:
        async for msg in consumer:
            analytics.process(msg.value)
    finally:
        await consumer.stop()
        logger.info("Analytics summary: %s", analytics.summary())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
