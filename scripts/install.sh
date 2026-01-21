#!/bin/bash

# AIShot Install Script
# Reinstalls dependencies (run after changing package.json)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "📦 Installing dependencies..."

# Install frontend dependencies
echo "🎨 Installing frontend dependencies..."
cd frontend
npm install
npm run build
cd "$PROJECT_DIR"

# Rebuild images to install new dependencies
echo "🔨 Rebuilding API..."
docker-compose build api

echo "🔨 Rebuilding Worker..."
docker-compose build worker

# Restart services if running
if docker-compose ps | grep -q "Up"; then
    echo "🔄 Restarting services..."
    docker-compose up -d
fi

echo ""
echo "✅ Dependencies installed!"
