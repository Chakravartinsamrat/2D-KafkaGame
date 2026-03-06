#!/usr/bin/env bash
# start-kafka.sh — Start Kafka in KRaft mode for local development (macOS)
#
# Kafka 4.x uses KRaft (no ZooKeeper required).
#
# Prerequisites:
#   brew install kafka
#
# Usage:
#   chmod +x infra/scripts/start-kafka.sh
#   ./infra/scripts/start-kafka.sh

set -euo pipefail

KAFKA_HOME="${KAFKA_HOME:-/opt/homebrew/opt/kafka}"
KAFKA_BIN="$KAFKA_HOME/bin"
KAFKA_LOG_DIR="${KAFKA_LOG_DIR:-/tmp/kraft-combined-logs}"
KRAFT_CONFIG="$KAFKA_HOME/libexec/config/kraft/server.properties"

echo "==> Kafka KRaft Mode Startup"
echo "    KAFKA_HOME: $KAFKA_HOME"
echo "    Log dir: $KAFKA_LOG_DIR"

# Check if Kafka is already running
if "$KAFKA_BIN/kafka-broker-api-versions.sh" --bootstrap-server localhost:9092 &>/dev/null; then
    echo "==> Kafka is already running on localhost:9092"
    exit 0
fi

# Check if config exists
if [[ ! -f "$KRAFT_CONFIG" ]]; then
    echo "ERROR: KRaft config not found at $KRAFT_CONFIG"
    echo "Make sure Kafka is installed: brew install kafka"
    exit 1
fi

# Format storage if needed (first-time setup)
if [[ ! -d "$KAFKA_LOG_DIR/meta.properties" ]] && [[ ! -f "$KAFKA_LOG_DIR/meta.properties" ]]; then
    echo "==> First-time setup: Formatting KRaft storage..."

    # Generate a cluster ID
    CLUSTER_ID=$("$KAFKA_BIN/kafka-storage.sh" random-uuid)
    echo "    Cluster ID: $CLUSTER_ID"

    # Format the storage directory
    "$KAFKA_BIN/kafka-storage.sh" format \
        --config "$KRAFT_CONFIG" \
        --cluster-id "$CLUSTER_ID" \
        --ignore-formatted
fi

echo "==> Starting Kafka broker..."
echo "    This will run in the foreground. Use Ctrl+C to stop."
echo "    Or run in background: nohup ./infra/scripts/start-kafka.sh &"
echo ""

# Start Kafka server (foreground)
"$KAFKA_BIN/kafka-server-start.sh" "$KRAFT_CONFIG"
