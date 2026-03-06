"""
Kafka producer — publishes game events to the 'game-events' topic.

Uses aiokafka for non-blocking async I/O compatible with FastAPI/asyncio.
The producer is started once at application startup and gracefully stopped
on shutdown via FastAPI lifespan hooks.

If Kafka is unavailable the producer falls back to a no-op so the game
server can still run in development without Kafka running.

Environment variables:
  KAFKA_ENABLED          - Set to "false" to disable Kafka (default: true)
  KAFKA_BOOTSTRAP_SERVERS - Kafka broker address (default: localhost:9092)
  KAFKA_TOPIC            - Topic name (default: game-events)
  KAFKA_SASL_USERNAME    - SASL username for cloud Kafka (e.g., Upstash)
  KAFKA_SASL_PASSWORD    - SASL password for cloud Kafka
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Configuration from environment
KAFKA_ENABLED = os.getenv("KAFKA_ENABLED", "true").lower() == "true"
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "game-events")
KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_SASL_USERNAME = os.getenv("KAFKA_SASL_USERNAME")
KAFKA_SASL_PASSWORD = os.getenv("KAFKA_SASL_PASSWORD")

try:
    from aiokafka import AIOKafkaProducer
    _KAFKA_AVAILABLE = True
except ImportError:
    _KAFKA_AVAILABLE = False


class KafkaGameProducer:
    """Thin async wrapper around AIOKafkaProducer."""

    def __init__(self) -> None:
        self._producer: Optional[Any] = None

    async def start(self) -> None:
        if not KAFKA_ENABLED:
            logger.info("Kafka disabled via KAFKA_ENABLED=false")
            return

        if not _KAFKA_AVAILABLE:
            logger.warning("aiokafka not installed — Kafka producer disabled.")
            return

        try:
            # Build producer config
            config: dict[str, Any] = {
                "bootstrap_servers": KAFKA_BOOTSTRAP,
                "value_serializer": lambda v: json.dumps(v).encode("utf-8"),
            }

            # Add SASL authentication for cloud Kafka (Upstash, Confluent, etc.)
            if KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD:
                config.update({
                    "security_protocol": "SASL_SSL",
                    "sasl_mechanism": "SCRAM-SHA-256",
                    "sasl_plain_username": KAFKA_SASL_USERNAME,
                    "sasl_plain_password": KAFKA_SASL_PASSWORD,
                })
                logger.info("Kafka SASL authentication enabled")

            self._producer = AIOKafkaProducer(**config)
            await self._producer.start()
            logger.info("Kafka producer connected to %s", KAFKA_BOOTSTRAP)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Kafka unavailable (%s) — running without Kafka.", exc)
            self._producer = None

    async def stop(self) -> None:
        if self._producer is not None:
            await self._producer.stop()
            self._producer = None
            logger.info("Kafka producer stopped.")

    async def publish(self, event: dict[str, Any]) -> None:
        """Publish a single event dict to the game-events topic."""
        if self._producer is None:
            logger.debug("Kafka offline — skipping event: %s", event.get("type"))
            return
        try:
            await self._producer.send_and_wait(KAFKA_TOPIC, event)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to publish Kafka event: %s", exc)


# Module-level singleton used across the application
kafka_producer = KafkaGameProducer()
