#!/bin/bash

# VibeShot Stop Script
# Stops all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🛑 Stopping VibeShot..."

docker-compose down

echo "✅ VibeShot stopped"
