#!/usr/bin/env bash
# consume-events.sh — tail the game-events topic for debugging
#
# Usage:
#   ./infra/scripts/consume-events.sh

set -euo pipefail

KAFKA_BIN="${KAFKA_HOME:-/opt/homebrew/opt/kafka}/bin"
BOOTSTRAP="localhost:9092"
TOPIC="game-events"

echo "==> Tailing '$TOPIC' from the beginning (Ctrl-C to stop)…"
"$KAFKA_BIN/kafka-console-consumer.sh" \
  --bootstrap-server "$BOOTSTRAP" \
  --topic "$TOPIC" \
  --from-beginning \
  --property print.timestamp=true
