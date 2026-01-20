#!/bin/bash

# AIShot Setup Script
# Run this once to initialize the project

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 AIShot Setup"
echo "==============="

# Create data directories
echo "📁 Creating data directories..."
mkdir -p data/mysql
mkdir -p data/screenshots

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "   ⚠️  Please edit .env with your own secure passwords!"
else
    echo "✅ .env file already exists"
fi

# Build Docker images
echo "🔨 Building Docker images..."
docker-compose build

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "  ./scripts/start.sh"
echo ""
echo "To install/update dependencies after package.json changes:"
echo "  ./scripts/install.sh"
