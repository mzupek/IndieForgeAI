#!/bin/bash
# P1 Mac Verification Test
# Tests static asset image import and CLI functionality
# Uses built CLI output, isolated temp data only

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "P1 Mac Verification Test"
echo "=========================================="
echo ""

# Setup
TEST_DIR=$(mktemp -d -t forge-p1-test-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js"

echo "Test directory: $TEST_DIR"
echo "CLI: $CLI"
echo ""

# Cleanup function
cleanup() {
  echo ""
  echo "Cleaning up test directory: $TEST_DIR"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

# Create test image
TEST_IMAGE="$TEST_DIR/test-image.png"
echo "Creating test PNG image..."
# Create a simple 512x512 PNG with ImageMagick or equivalent
# For systems without ImageMagick, we'll create a minimal valid PNG
if command -v convert &> /dev/null; then
  convert -size 512x512 xc:blue "$TEST_IMAGE"
elif command -v magick &> /dev/null; then
  magick -size 512x512 xc:blue "$TEST_IMAGE"
else
  # Fallback: copy a placeholder or create minimal PNG via base64
  echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" | base64 -d > "$TEST_IMAGE"
fi

if [ ! -f "$TEST_IMAGE" ]; then
  echo -e "${RED}✗ Failed to create test image${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Test image created${NC}"
echo ""

# Initialize project
echo "Initializing project with game..."
mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "activeProjectId": "test-project",
  "projects": [],
  "openAIConfig": {},
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "test-project",
    "name": "P1 Test Project",
    "description": "Isolated test project for P1 verification",
    "games": [
      {
        "id": "game-test",
        "name": "Test Game",
        "engine": "RPG Maker MZ",
        "engineVersion": "1.8.0"
      }
    ],
    "characters": [],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "gameDefinitions": [],
    "visualAssets": [],
    "assetStates": []
  }
}
EOF
echo -e "${GREEN}✓ Project initialized${NC}"
echo ""

# Test 1: Create static asset WITHOUT image
echo "----------------------------------------"
echo "Test 1: Create asset without image"
echo "----------------------------------------"
ASSET1_OUTPUT=$($CLI asset create --game game-test --name "Logo No Image" --category logo)
ASSET1_ID=$(echo "$ASSET1_OUTPUT" | grep -o '[a-f0-9\-]\{36\}' | head -1)
echo "Asset ID: $ASSET1_ID"

# Verify creation
ASSET1_SHOW=$($CLI asset show "$ASSET1_ID" --game game-test)
if echo "$ASSET1_SHOW" | grep -q "Logo No Image"; then
  echo -e "${GREEN}✓ Asset created without image${NC}"
else
  echo -e "${RED}✗ Asset not found${NC}"
  exit 1
fi
echo ""

# Test 2: Create static asset WITH image (P1 requirement)
echo "----------------------------------------"
echo "Test 2: Create asset WITH static image"
echo "----------------------------------------"
ASSET2_OUTPUT=$($CLI asset create --game game-test --name "Logo With Image" --category logo --image "$TEST_IMAGE")
ASSET2_ID=$(echo "$ASSET2_OUTPUT" | grep -o '[a-f0-9\-]\{36\}' | head -1)
echo "Asset ID: $ASSET2_ID"

# Verify creation with thumbnail
ASSET2_SHOW=$($CLI asset show "$ASSET2_ID" --game game-test)
if echo "$ASSET2_SHOW" | grep -q "Logo With Image" && echo "$ASSET2_SHOW" | grep -q "Thumbnail:"; then
  echo -e "${GREEN}✓ Asset created with static image and thumbnail${NC}"
else
  echo -e "${RED}✗ Asset missing image/thumbnail${NC}"
  exit 1
fi

# Check thumbnail file exists
THUMBNAIL_PATH=$(echo "$ASSET2_SHOW" | grep "Thumbnail:" | awk '{print $2}')
if [ -f "$THUMBNAIL_PATH" ]; then
  echo -e "${GREEN}✓ Thumbnail file exists: $THUMBNAIL_PATH${NC}"
else
  echo -e "${RED}✗ Thumbnail file not found${NC}"
  exit 1
fi
echo ""

# Test 3: Update asset to add image (P1 requirement)
echo "----------------------------------------"
echo "Test 3: Update asset to add static image"
echo "----------------------------------------"
UPDATE_OUTPUT=$($CLI asset update "$ASSET1_ID" --game game-test --image "$TEST_IMAGE")
if echo "$UPDATE_OUTPUT" | grep -q "imported from"; then
  echo -e "${GREEN}✓ Asset updated with static image${NC}"
else
  echo -e "${RED}✗ Update failed${NC}"
  exit 1
fi

# Verify thumbnail added
ASSET1_UPDATED=$($CLI asset show "$ASSET1_ID" --game game-test)
if echo "$ASSET1_UPDATED" | grep -q "Thumbnail:"; then
  echo -e "${GREEN}✓ Thumbnail added via update${NC}"
else
  echo -e "${RED}✗ Thumbnail not added${NC}"
  exit 1
fi
echo ""

# Test 4: List assets (game-scoped)
echo "----------------------------------------"
echo "Test 4: List assets (game-scoped)"
echo "----------------------------------------"
LIST_OUTPUT=$($CLI asset list --game game-test)
ASSET_COUNT=$(echo "$LIST_OUTPUT" | grep -c "Logo" || true)
if [ "$ASSET_COUNT" -eq 2 ]; then
  echo -e "${GREEN}✓ Both assets listed for game${NC}"
else
  echo -e "${RED}✗ Expected 2 assets, found $ASSET_COUNT${NC}"
  exit 1
fi
echo ""

# Test 5: Create asset state (multi-state workflow)
echo "----------------------------------------"
echo "Test 5: Create asset with state"
echo "----------------------------------------"
ASSET3_OUTPUT=$($CLI asset create --game game-test --name "Door" --category prop)
ASSET3_ID=$(echo "$ASSET3_OUTPUT" | grep -o '[a-f0-9\-]\{36\}' | head -1)

# Add state
STATE1_OUTPUT=$($CLI asset-state create --game game-test --asset "$ASSET3_ID" --name "closed" --file "$TEST_IMAGE")
STATE1_ID=$(echo "$STATE1_OUTPUT" | grep -o '[a-f0-9\-]\{36\}' | head -1)
echo "State ID: $STATE1_ID"

# Verify state created
STATE_LIST=$($CLI asset-state list --game game-test --asset "$ASSET3_ID")
if echo "$STATE_LIST" | grep -q "closed"; then
  echo -e "${GREEN}✓ Asset state created${NC}"
else
  echo -e "${RED}✗ State not found${NC}"
  exit 1
fi
echo ""

# Test 6: Guard - Delete default state (should fail)
echo "----------------------------------------"
echo "Test 6: Guard - Prevent default state deletion"
echo "----------------------------------------"
# Set state as default
$CLI asset set-default-state "$ASSET3_ID" --game game-test --state "$STATE1_ID"

# Try to delete (should fail)
if $CLI asset-state delete "$STATE1_ID" --game game-test 2>&1 | grep -q "Cannot delete default state"; then
  echo -e "${GREEN}✓ Guard correctly prevented default state deletion${NC}"
else
  echo -e "${RED}✗ Guard failed - default state was deletable${NC}"
  exit 1
fi
echo ""

# Test 7: Cascade delete
echo "----------------------------------------"
echo "Test 7: Cascade delete asset + states"
echo "----------------------------------------"
DELETE_OUTPUT=$($CLI asset delete "$ASSET3_ID" --game game-test)
if echo "$DELETE_OUTPUT" | grep -q "deleted 1 state"; then
  echo -e "${GREEN}✓ Asset and states cascade deleted${NC}"
else
  echo -e "${RED}✗ Cascade delete failed${NC}"
  exit 1
fi
echo ""

# Test 8: CLI help syntax verification
echo "----------------------------------------"
echo "Test 8: CLI syntax uses --game consistently"
echo "----------------------------------------"
CREATE_HELP=$($CLI asset create --help)
if echo "$CREATE_HELP" | grep -q "\-\-game <id>"; then
  echo -e "${GREEN}✓ CLI uses --game flag (not positional)${NC}"
else
  echo -e "${RED}✗ CLI syntax incorrect${NC}"
  exit 1
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}All P1 CLI tests passed!${NC}"
echo "=========================================="
echo ""
echo "Verified:"
echo "  ✓ Static asset creation without image"
echo "  ✓ Static asset creation WITH image (--image flag)"
echo "  ✓ Asset update to add image"
echo "  ✓ Thumbnail generation and file persistence"
echo "  ✓ Game-scoped asset listing"
echo "  ✓ Multi-state asset workflow"
echo "  ✓ Guard: Default state deletion prevention"
echo "  ✓ Cascade delete (asset + owned states)"
echo "  ✓ CLI syntax consistency (--game flag)"
echo ""
echo "Next: Verify game dropdown switching in Electron UI"
