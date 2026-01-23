#!/bin/bash

# VibeShot Seed Script
# Seeds the database with test data

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

API_URL="http://localhost:3000"

echo "🌱 Seeding VibeShot database..."

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
for i in {1..30}; do
    if curl -s "$API_URL/api/health" > /dev/null 2>&1; then
        echo "✅ API is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ API did not become ready in time"
        exit 1
    fi
    sleep 1
done

# Register test user
echo "👤 Creating test user..."
RESPONSE=$(curl -s -X POST "$API_URL/api/auth/register" \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"password123"}')

TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    # User might already exist, try logging in
    echo "   User might exist, trying login..."
    RESPONSE=$(curl -s -X POST "$API_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"email":"test@example.com","password":"password123"}')
    TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
    echo "❌ Failed to authenticate"
    exit 1
fi

echo "✅ Authenticated"

# Create heise.de site
echo "🌐 Creating heise.de site..."
SITE_RESPONSE=$(curl -s -X POST "$API_URL/api/sites" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"heise online","domain":"heise.de"}')

SITE_ID=$(echo "$SITE_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)

if [ -z "$SITE_ID" ]; then
    echo "❌ Failed to create site"
    echo "$SITE_RESPONSE"
    exit 1
fi

echo "✅ Site created (ID: $SITE_ID)"

# Add pages
echo "📄 Adding pages..."

# Homepage
curl -s -X POST "$API_URL/api/sites/$SITE_ID/pages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Homepage","url":"https://www.heise.de/"}' > /dev/null

echo "   ✅ Homepage added"

# Newsticker
curl -s -X POST "$API_URL/api/sites/$SITE_ID/pages" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"name":"Newsticker","url":"https://www.heise.de/newsticker/"}' > /dev/null

echo "   ✅ Newsticker added"

echo ""
echo "✅ Database seeded successfully!"
echo ""
echo "   Test account:"
echo "   📧 Email:    test@example.com"
echo "   🔑 Password: password123"
echo ""
echo "   Site: heise online (heise.de)"
echo "   Pages:"
echo "     - Homepage: https://www.heise.de/"
echo "     - Newsticker: https://www.heise.de/newsticker/"
echo ""
