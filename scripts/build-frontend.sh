#!/bin/bash

# Build Frontend Script
# Rebuilds the React frontend and outputs to api/public/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR/frontend"

echo "🎨 Building frontend..."
npm run build

echo ""
echo "✅ Frontend built successfully!"
echo "   Output: api/public/"
