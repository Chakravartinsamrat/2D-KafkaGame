#!/usr/bin/env bash
# setup-kafka.sh — bootstrap Kafka topics for local development (macOS)
#
# Prerequisites:
#   brew install kafka
#   brew services start zookeeper
#   brew services start kafka
#
# Usage:
#   chmod +x infra/scripts/setup-kafka.sh
#   ./infra/scripts/setup-kafka.sh

set -euo pipefail

KAFKA_BIN="${KAFKA_HOME:-/opt/homebrew/opt/kafka}/bin"
BOOTSTRAP="localhost:9092"
TOPIC="game-events"

echo "==> Checking Kafka is running on $BOOTSTRAP…"
if ! "$KAFKA_BIN/kafka-broker-api-versions.sh" --bootstrap-server "$BOOTSTRAP" &>/dev/null; then
  echo "ERROR: Kafka broker not reachable at $BOOTSTRAP"
  echo "Start it with:  brew services start kafka"
  exit 1
fi

echo "==> Creating topic: $TOPIC"
"$KAFKA_BIN/kafka-topics.sh" \
  --bootstrap-server "$BOOTSTRAP" \
  --create \
  --if-not-exists \
  --topic "$TOPIC" \
  --partitions 3 \
  --replication-factor 1

echo "==> Existing topics:"
"$KAFKA_BIN/kafka-topics.sh" --bootstrap-server "$BOOTSTRAP" --list

echo "==> Done. Kafka is ready for the 2D game."
