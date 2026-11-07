#!/bin/bash
# P1 Legacy Data Regression Test
# Tests that P1 code handles existing studio data without visualAssets/assetStates arrays
# Simulates Matt's real studio.json structure (pre-P1)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "P1 Legacy Data Regression Test"
echo "=========================================="
echo ""

# Setup
TEST_DIR=$(mktemp -d -t forge-p1-legacy-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js"

echo "Test directory: $TEST_DIR"
echo ""

# Cleanup
cleanup() {
  echo ""
  echo "Cleaning up: $TEST_DIR"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Create legacy studio.json WITHOUT visualAssets/assetStates (pre-P1 structure)
echo "Creating legacy studio.json (pre-P1)..."
mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "activeProjectId": "legacy-project",
  "projects": [],
  "openAIConfig": {},
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy Project",
    "description": "Existing project before P1",
    "games": [
      {
        "id": "game-neon-recall",
        "name": "Neon Recall",
        "engine": "Unity",
        "engineVersion": "2022.3"
      }
    ],
    "characters": [
      {
        "id": "char-1",
        "gameId": "game-neon-recall",
        "name": "Hero",
        "description": "Main character",
        "schemaVersion": 1,
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "gameDefinitions": []
  }
}
EOF
echo -e "${GREEN}✓ Legacy studio.json created (no visualAssets/assetStates)${NC}"
echo ""

# Test 1: List assets on legacy data (should not crash)
echo "----------------------------------------"
echo "Test 1: List assets (legacy data)"
echo "----------------------------------------"
if $CLI asset list --game game-neon-recall 2>&1 | grep -q "No visual assets found"; then
  echo -e "${GREEN}✓ List succeeded (empty result, no crash)${NC}"
else
  OUTPUT=$($CLI asset list --game game-neon-recall 2>&1)
  if echo "$OUTPUT" | grep -q "Cannot read properties of undefined"; then
    echo -e "${RED}✗ CRASH: $OUTPUT${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ List succeeded${NC}"
fi
echo ""

# Test 2: Create asset (should initialize arrays)
echo "----------------------------------------"
echo "Test 2: Create asset (initialize arrays)"
echo "----------------------------------------"
ASSET_OUTPUT=$($CLI asset create --game game-neon-recall --name "Logo" --category logo)
ASSET_ID=$(echo "$ASSET_OUTPUT" | grep -o '[a-f0-9\-]\{36\}' | head -1)
if [ -n "$ASSET_ID" ]; then
  echo -e "${GREEN}✓ Asset created: $ASSET_ID${NC}"
else
  echo -e "${RED}✗ Asset creation failed${NC}"
  exit 1
fi
echo ""

# Test 3: Verify arrays persisted
echo "----------------------------------------"
echo "Test 3: Verify arrays persisted"
echo "----------------------------------------"
if grep -q '"visualAssets":' "$TEST_DIR/studio.json"; then
  echo -e "${GREEN}✓ visualAssets array persisted${NC}"
else
  echo -e "${RED}✗ visualAssets array missing${NC}"
  exit 1
fi

if grep -q '"assetStates":' "$TEST_DIR/studio.json"; then
  echo -e "${GREEN}✓ assetStates array persisted${NC}"
else
  echo -e "${RED}✗ assetStates array missing${NC}"
  exit 1
fi
echo ""

# Test 4: List assets again (should show created asset)
echo "----------------------------------------"
echo "Test 4: List assets (after creation)"
echo "----------------------------------------"
LIST_OUTPUT=$($CLI asset list --game game-neon-recall)
if echo "$LIST_OUTPUT" | grep -q "Logo"; then
  echo -e "${GREEN}✓ Asset listed correctly${NC}"
else
  echo -e "${RED}✗ Asset not listed${NC}"
  exit 1
fi
echo ""

# Test 5: Verify existing data preserved
echo "----------------------------------------"
echo "Test 5: Verify existing data preserved"
echo "----------------------------------------"
if grep -q '"char-1"' "$TEST_DIR/studio.json"; then
  echo -e "${GREEN}✓ Existing character preserved${NC}"
else
  echo -e "${RED}✗ Existing data lost!${NC}"
  exit 1
fi

if grep -q '"Neon Recall"' "$TEST_DIR/studio.json"; then
  echo -e "${GREEN}✓ Existing game preserved${NC}"
else
  echo -e "${RED}✗ Existing game lost!${NC}"
  exit 1
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}All legacy data regression tests passed!${NC}"
echo "=========================================="
echo ""
echo "Verified:"
echo "  ✓ No crash on listing with missing arrays"
echo "  ✓ Arrays initialized on first write"
echo "  ✓ New data persists correctly"
echo "  ✓ Existing data preserved (non-destructive)"
echo ""
