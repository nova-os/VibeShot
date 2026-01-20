#!/bin/bash

# AIShot Reset Script
# Resets all data (MySQL + screenshots)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "⚠️  This will DELETE all data (database + screenshots)!"
read -p "Are you sure? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🛑 Stopping services..."
    docker-compose down
    
    echo "🗑️  Removing data directories..."
    rm -rf data/mysql
    rm -rf data/screenshots
    
    echo "📁 Recreating data directories..."
    mkdir -p data/mysql
    mkdir -p data/screenshots
    
    echo ""
    echo "✅ Data reset complete!"
    echo ""
    echo "Run ./scripts/start.sh to start fresh"
else
    echo "❌ Cancelled"
fi
