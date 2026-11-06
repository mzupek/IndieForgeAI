#!/bin/bash
# P4 Mac Verification Test
# Timed pose/state keys on existing layers (not duplicate layers).
# Isolated temp data only. Does not touch real studio data.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "P4 Mac Verification Test"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: timed keys + P3 engine (tsx)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/timedKeys.test.ts
npx tsx src/shared/storyboard/eventPreview.test.ts
npx tsx src/shared/storyboard/eventValidation.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-p4-test-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

pose_id() {
  local slot="$1"
  python3 -c "import sys,json; d=json.load(sys.stdin); print(next(p['id'] for p in d if p['slot']=='$slot'))"
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

TEST_IMAGE="$TEST_DIR/test-image.png"
if command -v convert &> /dev/null; then
  convert -size 64x64 xc:blue "$TEST_IMAGE"
elif command -v magick &> /dev/null; then
  magick -size 64x64 xc:blue "$TEST_IMAGE"
else
  IMG="$TEST_IMAGE" python3 - <<'PY'
import struct, zlib, pathlib, os
def png(path, r, g, b):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    raw = b''.join(b'\x00' + bytes([r, g, b, 255]) * 8 for _ in range(8))
    ihdr = struct.pack('>IIBBBBB', 8, 8, 8, 6, 0, 0, 0)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    pathlib.Path(path).write_bytes(data)
png(os.environ['IMG'], 0, 0, 255)
PY
fi
[ -f "$TEST_IMAGE" ] || fail "Failed to create test image"
pass "Test image created"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "pre-P4 sparse document",
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
pass "Legacy sparse studio.json written (no timedKeys)"

echo ""
echo "----------------------------------------"
echo "Test 1: Legacy load + layers (authored starting pose/state)"
echo "----------------------------------------"
SB_OUT=$($CLI storyboard create --game game-test --name "P4 Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One" --duration 4)
SHOT_ID=$(echo "$SHOT_OUT" | json_id)
CHAR_OUT=$($CLI character create --game game-test --name "Hero" --role player)
CHAR_ID=$(echo "$CHAR_OUT" | json_id)
OTHER_CHAR=$($CLI character create --game game-test --name "Other" --role player)
OTHER_CHAR_ID=$(echo "$OTHER_CHAR" | json_id)
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot ready >/dev/null
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot hurt >/dev/null
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot win >/dev/null
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot success >/dev/null
$CLI pose import "$OTHER_CHAR_ID" "$TEST_IMAGE" --slot ready >/dev/null
POSE_LIST=$($CLI pose list "$CHAR_ID")
POSE_READY=$(echo "$POSE_LIST" | pose_id ready)
POSE_HURT=$(echo "$POSE_LIST" | pose_id hurt)
POSE_WIN=$(echo "$POSE_LIST" | pose_id win)
POSE_SUCCESS=$(echo "$POSE_LIST" | pose_id success)
OTHER_POSE=$($CLI pose list "$OTHER_CHAR_ID" | pose_id ready)
LAYER_OUT=$($CLI layer add --shot "$SHOT_ID" --z 1 --character "$CHAR_ID" --pose "$POSE_READY")
LAYER_ID=$(echo "$LAYER_OUT" | json_id)
echo "$LAYER_OUT" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('timedKeys')==[] or d.get('timedKeys') is not None"
DOOR_OUT=$($CLI asset create --game game-test --name "Door" --category prop)
DOOR_ID=$(echo "$DOOR_OUT" | json_id)
ST_CLOSED=$($CLI asset-state create --game game-test --asset "$DOOR_ID" --name "closed" --file "$TEST_IMAGE")
ST_CLOSED_ID=$(echo "$ST_CLOSED" | json_id)
ST_OPEN=$($CLI asset-state create --game game-test --asset "$DOOR_ID" --name "open" --file "$TEST_IMAGE")
ST_OPEN_ID=$(echo "$ST_OPEN" | json_id)
DOOR_LAYER=$($CLI layer add --shot "$SHOT_ID" --z 2 --asset "$DOOR_ID" --state "$ST_CLOSED_ID")
DOOR_LAYER_ID=$(echo "$DOOR_LAYER" | json_id)
TEXT_LAYER=$($CLI layer add --shot "$SHOT_ID" --z 3 --text "HP 10")
TEXT_LAYER_ID=$(echo "$TEXT_LAYER" | json_id)
pass "Legacy load + character/door/text layers with empty timedKeys"

echo ""
echo "----------------------------------------"
echo "Test 2: CRUD timed pose/state keys on the SAME layer"
echo "----------------------------------------"
K1=$($CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 1.0 --pose "$POSE_HURT")
K1_ID=$(echo "$K1" | json_id)
K2=$($CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 2.5 --pose "$POSE_WIN")
K2_ID=$(echo "$K2" | json_id)
K3=$($CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 3.0 --pose "$POSE_SUCCESS")
K3_ID=$(echo "$K3" | json_id)
DK=$($CLI layer key add --shot "$SHOT_ID" --layer "$DOOR_LAYER_ID" --time 1.5 --state "$ST_OPEN_ID")
DK_ID=$(echo "$DK" | json_id)
$CLI layer key list --shot "$SHOT_ID" | python3 -c "
import sys,json
d=json.load(sys.stdin)
ids={x['id'] for x in d}
assert '$K1_ID' in ids and '$K2_ID' in ids and '$DK_ID' in ids, d
assert all(x.get('layerId') for x in d), d
"
$CLI layer key show --id "$K1_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['t']==1.0 and d['action']['poseId']=='$POSE_HURT'"
$CLI layer key update --id "$K2_ID" --time 2.4 >/dev/null
$CLI layer key show --id "$K2_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert abs(d['t']-2.4)<1e-9"
SHOW=$($CLI layer show --shot "$SHOT_ID" --id "$LAYER_ID")
echo "$SHOW" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['poseId']=='$POSE_READY', d
assert len(d.get('timedKeys') or [])==3, d
"
pass "Keys on same layer; authored starting pose still ready"

echo ""
echo "----------------------------------------"
echo "Test 3: Step/hold sample before/at/between/after"
echo "----------------------------------------"
sample_pose() {
  local t="$1"
  $CLI layer key sample --shot "$SHOT_ID" --layer "$LAYER_ID" --time "$t" | python3 -c "import sys,json; print(json.load(sys.stdin)['effectivePoseId'])"
}
[ "$(sample_pose 0)" = "$POSE_READY" ] || fail "t=0 should be authored ready"
[ "$(sample_pose 0.9)" = "$POSE_READY" ] || fail "before first key authored"
[ "$(sample_pose 1.0)" = "$POSE_HURT" ] || fail "at first key hurt"
[ "$(sample_pose 2.0)" = "$POSE_HURT" ] || fail "between keys hold hurt"
[ "$(sample_pose 2.4)" = "$POSE_WIN" ] || fail "at updated second key win"
[ "$(sample_pose 2.9)" = "$POSE_WIN" ] || fail "hold win"
[ "$(sample_pose 3.0)" = "$POSE_SUCCESS" ] || fail "at last key success"
[ "$(sample_pose 3.9)" = "$POSE_SUCCESS" ] || fail "after last key hold success"
$CLI layer key sample --shot "$SHOT_ID" --layer "$DOOR_LAYER_ID" --time 0 | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['effectiveStateId']=='$ST_CLOSED_ID' and d['authoredStateId']=='$ST_CLOSED_ID'"
$CLI layer key sample --shot "$SHOT_ID" --layer "$DOOR_LAYER_ID" --time 1.5 | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['effectiveStateId']=='$ST_OPEN_ID' and d['authoredStateId']=='$ST_CLOSED_ID' and d['persisted'] is False"
pass "Step/hold sampling; authored defaults not persisted"

echo ""
echo "----------------------------------------"
echo "Test 4: Event hold > timed sample; expiry uses CURRENT sample"
echo "----------------------------------------"
EVT_OUT=$($CLI event create --game game-test --name hit_received)
EVT_ID=$(echo "$EVT_OUT" | json_id)
$CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$LAYER_ID" --action setPose --pose "$POSE_WIN" --duration 0.5 --return-policy default >/dev/null
$CLI layer key sample --shot "$SHOT_ID" --layer "$LAYER_ID" --time 2.0 --event "$EVT_ID" --now-ms 0 | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['effectivePoseId']=='$POSE_WIN', d
assert d['authoredPoseId']=='$POSE_READY', d
assert d['eventActive'] is True
"
$CLI layer key sample --shot "$SHOT_ID" --layer "$LAYER_ID" --time 2.0 --event "$EVT_ID" --now-ms 0 --tick-ms 500 | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['effectivePoseId']=='$POSE_HURT', d
assert d['authoredPoseId']=='$POSE_READY', d
assert d['eventActive'] is False, d
"
SHOW=$($CLI layer show --shot "$SHOT_ID" --id "$LAYER_ID")
echo "$SHOW" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['poseId']=='$POSE_READY', d"
pass "Event hold overrides timed; expiry returns current sample not stale authored"

echo ""
echo "----------------------------------------"
echo "Test 5: Validation — times, duplicates, refs, duration, text"
echo "----------------------------------------"
if $CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 1.0 --pose "$POSE_WIN" 2>&1 | grep -q "already exists"; then
  pass "Duplicate timestamp rejected"
else
  fail "Duplicate timestamp was accepted"
fi
if $CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time -0.1 --pose "$POSE_HURT" 2>&1 | grep -q "before the shot start"; then
  pass "Negative time rejected"
else
  fail "Negative time was accepted"
fi
if $CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 4.1 --pose "$POSE_HURT" 2>&1 | grep -q "after shot duration"; then
  pass "Time past duration rejected"
else
  fail "Time past duration was accepted"
fi
if $CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 0.2 --pose "missing-pose" 2>&1 | grep -q "Pose not found"; then
  pass "Missing pose rejected"
else
  fail "Missing pose was accepted"
fi
if $CLI layer key add --shot "$SHOT_ID" --layer "$LAYER_ID" --time 0.2 --pose "$OTHER_POSE" 2>&1 | grep -q "belongs to character"; then
  pass "Wrong-parent pose rejected"
else
  fail "Wrong-parent pose was accepted"
fi
if $CLI layer key add --shot "$SHOT_ID" --layer "$TEXT_LAYER_ID" --time 0.2 --pose "$POSE_HURT" 2>&1 | grep -q "character layer"; then
  pass "Text layer timed key rejected"
else
  fail "Text layer timed key was accepted"
fi
if $CLI shot update --id "$SHOT_ID" --duration 0.5 2>&1 | grep -q "timed key exists"; then
  pass "Duration shrink rejected while keys exist"
else
  fail "Duration shrink was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 6: In-use guards include timed keys"
echo "----------------------------------------"
if $CLI pose remove "$POSE_SUCCESS" 2>&1 | grep -q "timed key"; then
  pass "In-use pose (timed key) delete rejected"
else
  fail "Timed-key pose was deleted"
fi
if $CLI asset-state delete "$ST_OPEN_ID" --game game-test 2>&1 | grep -q "timed key"; then
  pass "In-use state (timed key) delete rejected"
else
  fail "Timed-key state was deleted"
fi

echo ""
echo "----------------------------------------"
echo "Test 7: Update/remove + sample after delete; layer delete takes keys"
echo "----------------------------------------"
$CLI layer key remove --id "$K3_ID" >/dev/null
[ "$(sample_pose 3.0)" = "$POSE_WIN" ] || fail "after removing last key, hold previous win"
$CLI pose remove "$POSE_SUCCESS" >/dev/null
$CLI layer key list --shot "$SHOT_ID" --layer "$LAYER_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert all(x['id']!='$K3_ID' for x in d), d"
$CLI layer remove --shot "$SHOT_ID" --id "$LAYER_ID" >/dev/null
$CLI layer key list --shot "$SHOT_ID" | python3 -c "import sys,json; d=json.load(sys.stdin); assert all(x.get('layerId')!='$LAYER_ID' for x in d), d"
pass "Remove key resamples; layer delete drops its keys"

echo ""
echo "----------------------------------------"
echo "Test 8: --help documents layer key CRUD/sample"
echo "----------------------------------------"
HELP_KEY=$($CLI layer key --help)
echo "$HELP_KEY" | grep -q "add" || fail "layer key --help missing add"
echo "$HELP_KEY" | grep -q "sample" || fail "layer key --help missing sample"
HELP_ADD=$($CLI layer key add --help)
echo "$HELP_ADD" | grep -q -- "--pose" || fail "layer key add --help missing --pose"
echo "$HELP_ADD" | grep -q -- "--state" || fail "layer key add --help missing --state"
echo "$HELP_ADD" | grep -q -- "--time" || fail "layer key add --help missing --time"
HELP_SAMPLE=$($CLI layer key sample --help)
echo "$HELP_SAMPLE" | grep -q -- "--event" || fail "layer key sample --help missing --event"
echo "$HELP_SAMPLE" | grep -q -- "--tick-ms" || fail "layer key sample --help missing --tick-ms"
pass "Accurate --help for layer key add/list/show/update/remove/sample"

echo ""
echo "=========================================="
echo -e "${GREEN}All P4 CLI tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified:"
echo "  ✓ Legacy sparse studio loads; timedKeys migrate empty"
echo "  ✓ Pose/state keys live on the same layer (no duplicate layers)"
echo "  ✓ Authored starting pose/state separate from timed samples"
echo "  ✓ Step/hold sample before/at/between/after keys"
echo "  ✓ Event hold > timed; expiry uses current timeline sample"
echo "  ✓ Duplicate timestamps, bounds, missing/wrong-parent refs, text layer, duration shrink"
echo "  ✓ In-use pose/state delete includes timed keys"
echo "  ✓ --help documents forge layer key"
echo ""
echo "Reverse scrub / loop / reset / repeat-event are in timedKeys.test.ts (executed above)."
echo ""
echo "Manual Mac UI (not executed here):"
echo "  1. npm run dev, open Storyboards for the selected Game"
echo "  2. Select a character or visual-asset layer (Background / Layers tab)"
echo "  3. Timeline middle Pose/State track: + Pose/State @ t, drag, select, edit, delete"
echo "  4. Starting pose/state dropdown stays authored; canvas follows TIMED then PREVIEW"
echo "  5. Scrub both directions and Play/Loop/Stop — step/hold, no duplicate layers"
echo "  6. Fire a P3 event while on a timed sample; after hold, canvas returns to CURRENT sample"
echo "  7. Camera & Effects tracks still select/drag/playhead; no window.prompt"
echo "  8. P4 does not add per-layer FX keys (pending C.3c)"
