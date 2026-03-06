#!/usr/bin/env bash
# stop-kafka.sh — Stop Kafka broker (macOS)
#
# Usage:
#   chmod +x infra/scripts/stop-kafka.sh
#   ./infra/scripts/stop-kafka.sh

set -euo pipefail

KAFKA_HOME="${KAFKA_HOME:-/opt/homebrew/opt/kafka}"
KAFKA_BIN="$KAFKA_HOME/bin"

echo "==> Stopping Kafka..."

# Use kafka-server-stop.sh if available
if [[ -x "$KAFKA_BIN/kafka-server-stop.sh" ]]; then
    "$KAFKA_BIN/kafka-server-stop.sh" || true
fi

# Also try to kill any remaining kafka processes
pkill -f "kafka.Kafka" 2>/dev/null || true

# Verify it stopped
sleep 2
if "$KAFKA_BIN/kafka-broker-api-versions.sh" --bootstrap-server localhost:9092 &>/dev/null; then
    echo "WARNING: Kafka may still be running"
else
    echo "==> Kafka stopped successfully"
fi
