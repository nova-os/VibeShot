#!/bin/bash

# AIShot Stop Script
# Stops all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🛑 Stopping AIShot..."

docker-compose down

echo "✅ AIShot stopped"
