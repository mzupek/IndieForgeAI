#!/bin/bash
# Visual-asset layer source aspect (wide/tall/square). Isolated temp data.
# Does NOT verify Electron Storyboard pixels.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Layer source-aspect verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: contain / metadata / stale thumb / hit (tsx)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/layerAspect.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-layer-aspect-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

echo "Test directory: $TEST_DIR"
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

write_png() {
  W="$1" H="$2" OUT="$3" python3 - <<'PY'
import struct, zlib, pathlib, os
w, h = int(os.environ['W']), int(os.environ['H'])
def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
raw = b''.join(b'\x00' + bytes([0, 80, 200, 255]) * w for _ in range(h))
ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
pathlib.Path(os.environ['OUT']).write_bytes(data)
PY
}

WIDE="$TEST_DIR/wide-200x40.png"
TALL="$TEST_DIR/tall-40x200.png"
SQUARE="$TEST_DIR/square-64.png"
write_png 200 40 "$WIDE"
write_png 40 200 "$TALL"
write_png 64 64 "$SQUARE"
[ -f "$WIDE" ] && [ -f "$TALL" ] && [ -f "$SQUARE" ] || fail "Failed to create fixture PNGs"
pass "Wide/tall/square fixture PNGs"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "layer aspect isolated studio",
    "games": [
      {
        "id": "game-test",
        "name": "Test Game",
        "engine": "unity",
        "exportRoot": "./exports/test",
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
    "gameDefinitions": [],
    "visualAssets": [],
    "assetStates": []
  }
}
EOF

SB=$($CLI storyboard create --game game-test --name "Aspect Board")
SB_ID=$(echo "$SB" | json_id)
SHOT=$($CLI shot add --storyboard "$SB_ID" --name "Aspect Shot")
SHOT_ID=$(echo "$SHOT" | json_id)

WIDE_ASSET=$($CLI asset create --game game-test --name "Wide Housing" --category prop --image "$WIDE")
WIDE_ID=$(echo "$WIDE_ASSET" | json_id)
echo "$WIDE_ASSET" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('pixelSize')=={'width':200,'height':40}, d.get('pixelSize')
"

TALL_ASSET=$($CLI asset create --game game-test --name "Tall Prop" --category prop --image "$TALL")
TALL_ID=$(echo "$TALL_ASSET" | json_id)
SQ_ASSET=$($CLI asset create --game game-test --name "Square Logo" --category logo --image "$SQUARE")
SQ_ID=$(echo "$SQ_ASSET" | json_id)

STRIP=$($CLI asset create --game game-test --name "Lock Strip" --category prop)
STRIP_ID=$(echo "$STRIP" | json_id)
LOCKED=$($CLI asset-state create --game game-test --asset "$STRIP_ID" --name "Locked" --file "$WIDE")
LOCKED_ID=$(echo "$LOCKED" | json_id)
echo "$LOCKED" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d.get('boundingBox')=={'width':200,'height':40}, d.get('boundingBox')
"
IDLE=$($CLI asset-state create --game game-test --asset "$STRIP_ID" --name "Idle" --file "$SQUARE")
IDLE_ID=$(echo "$IDLE" | json_id)
$CLI asset set-default-state "$STRIP_ID" --game game-test --state "$LOCKED_ID" >/dev/null

# Existing-style stale thumb box on a third state (do not migrate; canvas uses decoded size)
STALE=$($CLI asset-state create --game game-test --asset "$STRIP_ID" --name "StaleThumb" --file "$WIDE")
STALE_ID=$(echo "$STALE" | json_id)
python3 - "$TEST_DIR/studio.json" "$STALE_ID" <<'PY'
import json,sys
p, sid = sys.argv[1], sys.argv[2]
studio=json.load(open(p))
for s in studio['assetPipeline']['assetStates']:
    if s['id']==sid:
        s['boundingBox']={'width':256,'height':256}
json.dump(studio, open(p,'w'), indent=2)
PY
pass "Imports record source pixelSize/boundingBox (not 256² thumb)"

L_WIDE=$($CLI layer add --shot "$SHOT_ID" --z 1 --asset "$WIDE_ID" --scale 1.25)
L_WIDE_ID=$(echo "$L_WIDE" | json_id)
echo "$L_WIDE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert abs(d.get('scale',0)-1.25)<1e-6, d
assert d.get('x')==0.5
"
L_STRIP=$($CLI layer add --shot "$SHOT_ID" --z 2 --asset "$STRIP_ID")
L_STRIP_ID=$(echo "$L_STRIP" | json_id)
$CLI layer add --shot "$SHOT_ID" --z 3 --asset "$TALL_ID" >/dev/null
$CLI layer add --shot "$SHOT_ID" --z 4 --asset "$SQ_ID" >/dev/null
pass "Existing-style layers keep authored scale/position"

npx tsx src/shared/storyboard/layerAspect.cli-roundtrip.ts
pass "planLayerDraw uses source aspect; stale 256² overridden by natural size"

BEFORE_SCALE=$(python3 - "$TEST_DIR/studio.json" "$L_WIDE_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
layer=next(l for s in studio['assetPipeline']['storyboardShots'] for l in s['layers'] if l['id']==sys.argv[2])
print(layer['scale'])
PY
)
$CLI layer update --shot "$SHOT_ID" --id "$L_WIDE_ID" --fit-source >/dev/null
AFTER=$(python3 - "$TEST_DIR/studio.json" "$L_WIDE_ID" <<'PY'
import json,sys
studio=json.load(open(sys.argv[1]))
layer=next(l for s in studio['assetPipeline']['storyboardShots'] for l in s['layers'] if l['id']==sys.argv[2])
assert abs(layer['scale']-1)<1e-6, layer
assert abs(layer['x']-0.5)<1e-6
print('ok')
PY
)
[ "$AFTER" = "ok" ] || fail "--fit-source rewrote more than scale"
python3 -c "assert abs(float('$BEFORE_SCALE')-1.25)<1e-6"
pass "--fit-source resets scale to 1; position unchanged"

HELP=$($CLI layer update --help)
echo "$HELP" | grep -q -- "--fit-source" || fail "layer update --help missing --fit-source"
pass "CLI --help documents --fit-source"

echo ""
echo "=========================================="
echo -e "${GREEN}All layer source-aspect tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Wide/tall/square static + stateful strip"
echo "  ✓ boundingBox/pixelSize are source pixels, not 256² thumbs"
echo "  ✓ Existing layers keep scale; draw contain uses source aspect"
echo "  ✓ Stale thumb box yields to decoded size"
echo "  ✓ --fit-source resets scale only"
echo ""
echo "NOT executed here: Mac Storyboard canvas pixels."
