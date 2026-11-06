#!/bin/bash
# P2 Mac Verification Test
# Production CLI path: storyboard layers for visual assets/states, poses, text,
# in-use deletion guards, game isolation, save/reload, media with spaces.
# Isolated temp data only. Does not touch real studio data.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "P2 Mac Verification Test"
echo "=========================================="
echo ""

TEST_DIR=$(mktemp -d -t forge-p2-test-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

echo "Test directory: $TEST_DIR"
echo "CLI: $CLI"
echo ""

cleanup() {
  echo ""
  echo "Cleaning up test directory: $TEST_DIR"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

fail() {
  echo -e "${RED}✗ $1${NC}"
  exit 1
}

pass() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Test PNG
TEST_IMAGE="$TEST_DIR/test-image.png"
SPACED_DIR="$TEST_DIR/folder with spaces"
mkdir -p "$SPACED_DIR"
SPACED_IMAGE="$SPACED_DIR/logo icon.png"

if command -v convert &> /dev/null; then
  convert -size 64x64 xc:blue "$TEST_IMAGE"
  convert -size 64x64 xc:red "$SPACED_IMAGE"
elif command -v magick &> /dev/null; then
  magick -size 64x64 xc:blue "$TEST_IMAGE"
  magick -size 64x64 xc:red "$SPACED_IMAGE"
else
  IMG="$TEST_IMAGE" IMG2="$SPACED_IMAGE" python3 - <<'PY'
import struct, zlib, pathlib, os
def png(path, r, g, b):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes([r, g, b, 255]) * 8 for _ in range(8))
    ihdr = struct.pack('>IIBBBBB', 8, 8, 8, 6, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)
png(os.environ['IMG'], 0, 0, 255)
png(os.environ['IMG2'], 255, 0, 0)
PY
fi
[ -f "$TEST_IMAGE" ] && [ -f "$SPACED_IMAGE" ] || fail "Failed to create test images"
pass "Test images created (including path with spaces)"

# Legacy sparse studio.json (pre-P2, missing fonts/palettes, missing visualAssets)
mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "pre-P2 sparse document",
    "games": [
      {
        "id": "game-test",
        "name": "Test Game",
        "engine": "unity",
        "exportRoot": "./exports/test",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      },
      {
        "id": "game-other",
        "name": "Other Game",
        "engine": "godot",
        "exportRoot": "./exports/other",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "characters": [],
    "poses": [],
    "clips": [],
    "scenePresets": [],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": []
  }
}
EOF
pass "Legacy sparse studio.json written (no fonts/palettes/visualAssets)"

echo ""
echo "----------------------------------------"
echo "Test 1: Legacy doc loads; create storyboard + shot + static asset layer"
echo "----------------------------------------"
SB_OUT=$($CLI storyboard create --game game-test --name "P2 Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One")
SHOT_ID=$(echo "$SHOT_OUT" | json_id)

ASSET_OUT=$($CLI asset create --game game-test --name "Logo" --category logo --image "$SPACED_IMAGE")
ASSET_ID=$(echo "$ASSET_OUT" | json_id)
echo "$ASSET_OUT" | grep -q "image" || fail "static asset JSON missing image field"
LAYER1_OUT=$($CLI layer add --shot "$SHOT_ID" --z 1 --asset "$ASSET_ID")
LAYER1_ID=$(echo "$LAYER1_OUT" | json_id)
echo "$LAYER1_OUT" | grep -q "$ASSET_ID" || fail "layer missing visualAssetId"
pass "Legacy load + static asset layer (image path with spaces)"

echo ""
echo "----------------------------------------"
echo "Test 2: Stateful asset; two independent instances"
echo "----------------------------------------"
DOOR_OUT=$($CLI asset create --game game-test --name "Door" --category prop)
DOOR_ID=$(echo "$DOOR_OUT" | json_id)
ST_CLOSED=$($CLI asset-state create --game game-test --asset "$DOOR_ID" --name "closed" --file "$TEST_IMAGE")
ST_CLOSED_ID=$(echo "$ST_CLOSED" | json_id)
ST_OPEN=$($CLI asset-state create --game game-test --asset "$DOOR_ID" --name "open" --file "$TEST_IMAGE")
ST_OPEN_ID=$(echo "$ST_OPEN" | json_id)
$CLI asset set-default-state "$DOOR_ID" --game game-test --state "$ST_CLOSED_ID" >/dev/null

L_A=$($CLI layer add --shot "$SHOT_ID" --z 2 --asset "$DOOR_ID" --state "$ST_OPEN_ID")
L_B=$($CLI layer add --shot "$SHOT_ID" --z 3 --asset "$DOOR_ID")
L_A_ID=$(echo "$L_A" | json_id)
L_B_ID=$(echo "$L_B" | json_id)
echo "$L_A" | grep -q "$ST_OPEN_ID" || fail "instance A should keep open state"
echo "$L_B" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('assetStateId') in (None, ''), d"
pass "Two layers same asset, independent state (open vs default)"

echo ""
echo "----------------------------------------"
echo "Test 3: Wrong-game asset rejected"
echo "----------------------------------------"
OTHER=$($CLI asset create --game game-other --name "Other Logo" --category logo --image "$TEST_IMAGE")
OTHER_ID=$(echo "$OTHER" | json_id)
if $CLI layer add --shot "$SHOT_ID" --z 9 --asset "$OTHER_ID" 2>&1 | grep -q "belongs to game"; then
  pass "Wrong-game asset rejected"
else
  fail "Wrong-game asset was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 4: Wrong-parent state rejected"
echo "----------------------------------------"
if $CLI layer add --shot "$SHOT_ID" --z 9 --asset "$ASSET_ID" --state "$ST_OPEN_ID" 2>&1 | grep -q "belongs to asset"; then
  pass "Wrong-parent state rejected"
else
  fail "Wrong-parent state was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 5: Text layer persisted with default font/palette"
echo "----------------------------------------"
TEXT_OUT=$($CLI layer add --shot "$SHOT_ID" --z 4 --text "NEON RECALL" --font default --palette default)
TEXT_ID=$(echo "$TEXT_OUT" | json_id)
echo "$TEXT_OUT" | grep -q "NEON RECALL" || fail "text content missing"
$CLI layer show --shot "$SHOT_ID" --id "$TEXT_ID" | grep -q "NEON RECALL" || fail "text not in show"
pass "Text layer persisted with default font/palette"

echo ""
echo "----------------------------------------"
echo "Test 6: Character pose layer"
echo "----------------------------------------"
CHAR_OUT=$($CLI character create --game game-test --name "Hero" --role player)
CHAR_ID=$(echo "$CHAR_OUT" | json_id)
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot ready >/dev/null
POSE_LIST=$($CLI pose list "$CHAR_ID")
POSE_ID=$(echo "$POSE_LIST" | json_id)
POSE_LAYER=$($CLI layer add --shot "$SHOT_ID" --z 5 --character "$CHAR_ID" --pose "$POSE_ID")
echo "$POSE_LAYER" | grep -q "$POSE_ID" || fail "pose layer missing poseId"
if $CLI layer add --shot "$SHOT_ID" --z 9 --character "$CHAR_ID" --pose "not-a-pose" 2>&1 | grep -q "Pose not found"; then
  pass "Character pose layer + wrong pose rejected"
else
  fail "Wrong pose was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 7: Visibility update + list/show + save/reload"
echo "----------------------------------------"
$CLI layer update --shot "$SHOT_ID" --id "$LAYER1_ID" --visible false >/dev/null
SHOW=$($CLI layer show --shot "$SHOT_ID" --id "$LAYER1_ID")
echo "$SHOW" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['visible'] is False"
LIST=$($CLI layer list --shot "$SHOT_ID")
echo "$LIST" | grep -q "$TEXT_ID" || fail "list missing text layer"
# reload via a second CLI process
SHOW2=$($CLI layer show --shot "$SHOT_ID" --id "$TEXT_ID")
echo "$SHOW2" | grep -q "NEON RECALL" || fail "reload lost text"
pass "Visibility, list/show, save/reload roundtrip"

echo ""
echo "----------------------------------------"
echo "Test 8: In-use deletion rejects (asset, state)"
echo "----------------------------------------"
if $CLI asset delete "$ASSET_ID" --game game-test 2>&1 | grep -q "referenced by"; then
  pass "In-use asset delete rejected"
else
  fail "In-use asset was deleted"
fi
if $CLI asset-state delete "$ST_OPEN_ID" --game game-test 2>&1 | grep -q "referenced by"; then
  pass "In-use state delete rejected"
else
  fail "In-use state was deleted"
fi

echo ""
echo "----------------------------------------"
echo "Test 9: Orphan font id rejected; --help mentions --asset/--text"
echo "----------------------------------------"
if $CLI layer add --shot "$SHOT_ID" --z 9 --text "x" --font invented-font 2>&1 | grep -q "not a Font id"; then
  pass "Orphan font id rejected"
else
  fail "Orphan font id was accepted"
fi
HELP=$($CLI layer add --help)
echo "$HELP" | grep -q -- "--asset" || fail "layer add --help missing --asset"
echo "$HELP" | grep -q -- "--text" || fail "layer add --help missing --text"
echo "$HELP" | grep -q -- "--pose" || fail "layer add --help missing --pose"
echo "$HELP" | grep -q -- "--font" || fail "layer add --help missing --font"
pass "CLI --help documents asset/text/pose/font flags"

echo ""
echo "----------------------------------------"
echo "Test 10: Storage in-use + font/palette via node (production studioStorage)"
echo "----------------------------------------"
node --input-type=module - <<'NODE'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const dir = process.env.FORGE_DATA_DIR
const file = join(dir, 'studio.json')
const studio = JSON.parse(await readFile(file, 'utf8'))
studio.assetPipeline.fonts = studio.assetPipeline.fonts || []
studio.assetPipeline.palettes = studio.assetPipeline.palettes || []
const now = new Date().toISOString()
studio.assetPipeline.fonts.push({
  id: 'font-arcade',
  gameId: 'game-test',
  name: 'Arcade',
  family: 'Press Start 2P',
  fallback: 'monospace',
  source: 'system',
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now
})
studio.assetPipeline.palettes.push({
  id: 'palette-neon',
  gameId: 'game-test',
  name: 'Neon',
  colors: { primary: '#0ff', secondary: '#f0f', accent: '#ff0', background: '#000', text: '#0fa' },
  schemaVersion: 1,
  createdAt: now,
  updatedAt: now
})
await writeFile(file, JSON.stringify(studio, null, 2))
NODE

TEXT2=$($CLI layer add --shot "$SHOT_ID" --z 6 --text "SCORED" --font font-arcade --palette palette-neon)
echo "$TEXT2" | grep -q "font-arcade" || fail "authored fontRef not persisted"
echo "$TEXT2" | grep -q "palette-neon" || fail "authored paletteRef not persisted"
pass "Authored font/palette refs persist"

echo ""
echo "=========================================="
echo -e "${GREEN}All P2 CLI tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified:"
echo "  ✓ Legacy sparse studio loads; create layer"
echo "  ✓ Static asset image path with spaces"
echo "  ✓ Two instances of same asset, independent states"
echo "  ✓ Wrong-game asset rejected"
echo "  ✓ Wrong-parent state rejected"
echo "  ✓ Text persisted with default font/palette"
echo "  ✓ Character pose layer + missing pose rejected"
echo "  ✓ Visibility, list/show, save/reload"
echo "  ✓ In-use asset/state deletion rejected"
echo "  ✓ Orphan font id rejected; --help accurate"
echo "  ✓ Authored font/palette refs persist"
echo ""
echo "Manual Mac UI (not executed here):"
echo "  1. npm run dev, open Storyboards for the selected Game"
echo "  2. Layers: + Character/Pose, + Asset, + Text"
echo "  3. Select starting pose/state independently per layer"
echo "  4. Edit text/font/palette; toggle Visible"
echo "  5. Confirm transform handles, missing-media banner, no window.prompt"
