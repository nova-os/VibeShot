#!/bin/bash

# VibeShot Reset Script
# Resets all data (MySQL + screenshots)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Parse arguments
SEED_AFTER=false
FORCE=false

for arg in "$@"; do
    case $arg in
        --seed)
            SEED_AFTER=true
            ;;
        -y|--yes)
            FORCE=true
            ;;
    esac
done

echo "⚠️  This will DELETE all data (database + screenshots)!"

if [ "$FORCE" = false ]; then
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Cancelled"
        exit 0
    fi
fi

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

if [ "$SEED_AFTER" = true ]; then
    echo ""
    echo "🚀 Starting services..."
    ./scripts/start.sh
    
    echo ""
    ./scripts/seed.sh
else
    echo ""
    echo "Run ./scripts/start.sh to start fresh"
    echo "Run ./scripts/seed.sh to seed test data (after starting)"
    echo ""
    echo "Or run: ./scripts/reset.sh --seed"
    echo "   to reset, start, and seed in one command"
fi
