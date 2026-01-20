#!/bin/bash

# AIShot Start Script
# Starts all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 Starting AIShot..."

# Ensure data directories exist
mkdir -p data/mysql
mkdir -p data/screenshots

# Start services
docker-compose up -d

echo ""
echo "✅ AIShot is running!"
echo ""
echo "   🌐 Web UI: http://localhost:3000"
echo "   📊 MySQL:  localhost:3306"
echo ""
echo "View logs:"
echo "   docker-compose logs -f"
echo "   docker-compose logs -f api"
echo "   docker-compose logs -f worker"
