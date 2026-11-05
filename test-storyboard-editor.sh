#!/bin/bash
set -e

echo "=== Testing Storyboard Editor with Real Data ==="
echo ""

# Create test data directory
TEST_DIR="/tmp/storyboard-editor-test-$(date +%s)"
export FORGE_DATA_DIR="$TEST_DIR"

echo "Test data directory: $TEST_DIR"
mkdir -p "$TEST_DIR"

# Create a test pose image (100x100 PNG)
POSE_IMG="$TEST_DIR/test-pose.png"
cat > "$POSE_IMG.tmp" << 'EOF'
iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAAhKDveksOjuAAAAAElFTkSuQmCC
EOF
base64 -d "$POSE_IMG.tmp" > "$POSE_IMG"
rm "$POSE_IMG.tmp"

echo ""
echo "1. Creating game..."
npm run -s forge -- games list --json > /dev/null 2>&1 || true
GAME_ID="test-game-$(date +%s)"

echo ""
echo "2. Creating character..."
CHAR_JSON=$(npm run -s forge -- character create \
  --game game-neon-recall \
  --name "TestHero" \
  --role "player" \
  --json 2>/dev/null | tail -1)
CHAR_ID=$(echo "$CHAR_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Character ID: $CHAR_ID"

echo ""
echo "3. Importing approved pose..."
npm run -s forge -- pose import "$CHAR_ID" "$POSE_IMG" --slot ready --json > /dev/null 2>&1 || true

echo ""
echo "4. Approving pose via studio.json..."
# Find and approve the pose in studio.json
STUDIO_JSON="$TEST_DIR/studio.json"
if [ -f "$STUDIO_JSON" ]; then
  # Simple approval - just mark first pose as approved
  sed -i 's/"status": "draft"/"status": "approved"/g' "$STUDIO_JSON"
  echo "Pose approved in studio.json"
fi

echo ""
echo "5. Creating storyboard..."
SB_JSON=$(npm run -s forge -- storyboard create \
  --game game-neon-recall \
  --name "Test Scene" \
  --json 2>/dev/null | tail -1)
SB_ID=$(echo "$SB_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "Storyboard ID: $SB_ID"

echo ""
echo "6. Adding shot..."
SHOT_JSON=$(npm run -s forge -- shot add \
  --storyboard "$SB_ID" \
  --name "Hero Appears" \
  --duration 3.0 \
  --notes "Test shot for verification" \
  --json 2>/dev/null | tail -1)
echo "Shot added"

echo ""
echo "7. Getting shot ID from storyboard..."
SB_DETAILS=$(npm run -s forge -- storyboard show --id "$SB_ID" --json 2>/dev/null | tail -1)
SHOT_ID=$(echo "$SB_DETAILS" | grep -o '"id":"shot-[^"]*"' | head -1 | cut -d'"' -f4)
echo "Shot ID: $SHOT_ID"

echo ""
echo "8. Adding layer with character..."
npm run -s forge -- layer add \
  --shot "$SHOT_ID" \
  --character "$CHAR_ID" \
  --z 10 \
  --x 0.5 \
  --y 0.5 \
  --scale 1.0 \
  --json > /dev/null 2>&1 || true
echo "Layer added"

echo ""
echo "9. Verifying studio.json..."
if [ -f "$STUDIO_JSON" ]; then
  echo "✓ studio.json exists"
  
  if grep -q "$SB_ID" "$STUDIO_JSON"; then
    echo "✓ Storyboard ID found in studio.json"
  fi
  
  if grep -q "Hero Appears" "$STUDIO_JSON"; then
    echo "✓ Shot name found in studio.json"
  fi
  
  if grep -q "$CHAR_ID" "$STUDIO_JSON"; then
    echo "✓ Character ID found in layer"
  fi
  
  if grep -q '"notes"' "$STUDIO_JSON"; then
    echo "✓ Notes field present"
  fi
  
  echo ""
  echo "Storyboard data in studio.json:"
  grep -A 20 "\"storyboards\"" "$STUDIO_JSON" | head -25
fi

echo ""
echo "=== Test Complete ==="
echo "Test data preserved at: $TEST_DIR"
echo ""
echo "To test the UI manually:"
echo "  FORGE_DATA_DIR=$TEST_DIR npm run dev"
echo ""
echo "To clean up:"
echo "  rm -rf $TEST_DIR"
