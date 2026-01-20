#!/bin/bash

# AIShot Logs Script
# Shows logs for all or specific services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

if [ -z "$1" ]; then
    # Show all logs
    docker-compose logs -f
else
    # Show logs for specific service
    docker-compose logs -f "$1"
fi
