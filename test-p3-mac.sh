#!/bin/bash
# P3 Mac Verification Test
# Production CLI: event/binding CRUD, preview-fire hold/return, in-use guards,
# game isolation, cascade on layer delete, authored defaults never overwritten.
# Isolated temp data only. Does not touch real studio data.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "P3 Mac Verification Test"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: preview engine + validation (tsx)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/eventPreview.test.ts
npx tsx src/shared/storyboard/eventValidation.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-p3-test-XXXXXX)
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

# Legacy sparse studio.json (pre-P3, missing event arrays AND P2 arrays)
mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "pre-P3 sparse document",
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
pass "Legacy sparse studio.json written (no eventDefinitions/eventBindings)"

echo ""
echo "----------------------------------------"
echo "Test 1: Legacy load + storyboard/shot/character/poses/layers"
echo "----------------------------------------"
SB_OUT=$($CLI storyboard create --game game-test --name "P3 Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One")
SHOT_ID=$(echo "$SHOT_OUT" | json_id)
CHAR_OUT=$($CLI character create --game game-test --name "Hero" --role player)
CHAR_ID=$(echo "$CHAR_OUT" | json_id)
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot ready >/dev/null
$CLI pose import "$CHAR_ID" "$TEST_IMAGE" --slot hurt >/dev/null
POSE_LIST=$($CLI pose list "$CHAR_ID")
POSE_IDLE=$(echo "$POSE_LIST" | pose_id ready)
POSE_HURT=$(echo "$POSE_LIST" | pose_id hurt)
LAYER_OUT=$($CLI layer add --shot "$SHOT_ID" --z 1 --character "$CHAR_ID" --pose "$POSE_IDLE")
LAYER_ID=$(echo "$LAYER_OUT" | json_id)
echo "$LAYER_OUT" | grep -q "$POSE_IDLE" || fail "character layer missing ready pose"
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
pass "Legacy load + Idle character, door, text layers"

echo ""
echo "----------------------------------------"
echo "Test 2: Event + binding CRUD (hit_received → Hurt, 0.5s default)"
echo "----------------------------------------"
EVT_OUT=$($CLI event create --game game-test --name hit_received --description "Character takes a hit")
EVT_ID=$(echo "$EVT_OUT" | json_id)
echo "$EVT_OUT" | grep -q "hit_received" || fail "event name missing"
BIND_OUT=$($CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$LAYER_ID" --action setPose --pose "$POSE_HURT" --duration 0.5 --return-policy default)
BIND_ID=$(echo "$BIND_OUT" | json_id)
echo "$BIND_OUT" | grep -q "$POSE_HURT" || fail "binding missing hurt pose"
echo "$BIND_OUT" | grep -q "0.5" || fail "binding missing duration"
$CLI binding list --shot "$SHOT_ID" | grep -q "$BIND_ID" || fail "binding list missing id"
$CLI event list --game game-test | grep -q "hit_received" || fail "event list missing name"
pass "Event + pose binding created and listed"

echo ""
echo "----------------------------------------"
echo "Test 3: Preview-fire applies Hurt; authored Idle not persisted"
echo "----------------------------------------"
FIRE0=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0)
echo "$FIRE0" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['fire']['matched']==1, d
ov=d['snapshot']['overrides']
assert ov['$LAYER_ID']['poseId']=='$POSE_HURT', ov
authored=next(x for x in d['authoredDefaults'] if x['id']=='$LAYER_ID')
assert authored['poseId']=='$POSE_IDLE', authored
assert d['persisted'] is False
"
SHOW=$($CLI layer show --shot "$SHOT_ID" --id "$LAYER_ID")
echo "$SHOW" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['poseId']=='$POSE_IDLE', d"
pass "Fire overlays Hurt; studio.json still Idle"

echo ""
echo "----------------------------------------"
echo "Test 4: Timed return at 500ms; still held at 499ms"
echo "----------------------------------------"
FIRE499=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0 --tick-ms 499)
echo "$FIRE499" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['snapshot']['overrides']['$LAYER_ID']['poseId']=='$POSE_HURT'"
FIRE500=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0 --tick-ms 500)
echo "$FIRE500" | python3 -c "import sys,json; d=json.load(sys.stdin); assert '$LAYER_ID' not in d['snapshot']['overrides'], d"
pass "Hold returns to authored default at duration"

echo ""
echo "----------------------------------------"
echo "Test 5: Hold policy does not return; instant stays"
echo "----------------------------------------"
HOLD_EVT=$($CLI event create --game game-test --name door_opened)
HOLD_EVT_ID=$(echo "$HOLD_EVT" | json_id)
HOLD_BIND=$($CLI binding create --game game-test --shot "$SHOT_ID" --event "$HOLD_EVT_ID" --layer "$DOOR_LAYER_ID" --action setState --state "$ST_OPEN_ID" --duration 0.5 --return-policy hold)
echo "$HOLD_BIND" | grep -q "$ST_OPEN_ID" || fail "state binding missing"
HOLD_FIRE=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$HOLD_EVT_ID" --now-ms 0 --tick-ms 10000)
echo "$HOLD_FIRE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['snapshot']['overrides']['$DOOR_LAYER_ID']['assetStateId']=='$ST_OPEN_ID'"
INSTANT_EVT=$($CLI event create --game game-test --name hide_text)
INSTANT_EVT_ID=$(echo "$INSTANT_EVT" | json_id)
$CLI binding create --game game-test --shot "$SHOT_ID" --event "$INSTANT_EVT_ID" --layer "$TEXT_LAYER_ID" --action setVisibility --visible false --duration 0 --return-policy default >/dev/null
INSTANT_FIRE=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$INSTANT_EVT_ID" --now-ms 0 --tick-ms 10000)
echo "$INSTANT_FIRE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['snapshot']['overrides']['$TEXT_LAYER_ID']['visible'] is False"
pass "Hold stays; instant stays until reset (no persist)"

echo ""
echo "----------------------------------------"
echo "Test 6: Wrong-parent pose, missing refs, wrong-game event rejected"
echo "----------------------------------------"
if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$DOOR_LAYER_ID" --action setPose --pose "$POSE_HURT" 2>&1 | grep -q "character layer"; then
  pass "setPose on asset layer rejected"
else
  fail "setPose on asset layer was accepted"
fi
if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$LAYER_ID" --action setPose --pose "not-a-pose" 2>&1 | grep -q "Pose not found"; then
  pass "Missing pose rejected"
else
  fail "Missing pose was accepted"
fi
OTHER_EVT=$($CLI event create --game game-other --name hit_received)
OTHER_EVT_ID=$(echo "$OTHER_EVT" | json_id)
if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$OTHER_EVT_ID" --layer "$LAYER_ID" --action setPose --pose "$POSE_HURT" 2>&1 | grep -q "belongs to game"; then
  pass "Wrong-game event rejected"
else
  fail "Wrong-game event was accepted"
fi
if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$DOOR_LAYER_ID" --action setState --state "missing-state" 2>&1 | grep -q "Asset state not found"; then
  pass "Missing state rejected"
else
  fail "Missing state was accepted"
fi

echo ""
echo "----------------------------------------"
echo "Test 7: In-use deletion guards (event, pose, state)"
echo "----------------------------------------"
if $CLI event remove --id "$EVT_ID" 2>&1 | grep -q "referenced by"; then
  pass "In-use event delete rejected"
else
  fail "In-use event was deleted"
fi
if $CLI pose remove "$POSE_HURT" 2>&1 | grep -q "referenced by"; then
  pass "In-use pose delete rejected"
else
  fail "In-use pose was deleted"
fi
if $CLI asset-state delete "$ST_OPEN_ID" --game game-test 2>&1 | grep -q "referenced by"; then
  pass "In-use state delete rejected"
else
  fail "In-use state was deleted"
fi

echo ""
echo "----------------------------------------"
echo "Test 8: Layer delete cascades bindings; event then deletable"
echo "----------------------------------------"
$CLI layer remove --shot "$SHOT_ID" --id "$LAYER_ID" >/dev/null
LIST_AFTER=$($CLI binding list --shot "$SHOT_ID")
echo "$LIST_AFTER" | python3 -c "import sys,json; d=json.load(sys.stdin); assert all(b['id']!='$BIND_ID' for b in d), d"
$CLI event remove --id "$EVT_ID" >/dev/null
$CLI event list --game game-test | python3 -c "import sys,json; d=json.load(sys.stdin); assert all(e['id']!='$EVT_ID' for e in d)"
pass "Layer delete cascaded pose binding; event removed after"

echo ""
echo "----------------------------------------"
echo "Test 9: Save/reload + --help documents event/binding flags"
echo "----------------------------------------"
RELOAD=$($CLI event list --game game-test)
echo "$RELOAD" | grep -q "door_opened" || fail "reload lost events"
HELP_EVT=$($CLI event create --help)
echo "$HELP_EVT" | grep -q -- "--name" || fail "event create --help missing --name"
echo "$HELP_EVT" | grep -q -- "--game" || fail "event create --help missing --game"
HELP_BIND=$($CLI binding create --help)
echo "$HELP_BIND" | grep -q -- "--action" || fail "binding create --help missing --action"
echo "$HELP_BIND" | grep -q -- "--duration" || fail "binding create --help missing --duration"
echo "$HELP_BIND" | grep -q -- "--return-policy" || fail "binding create --help missing --return-policy"
echo "$HELP_BIND" | grep -q -- "--pose" || fail "binding create --help missing --pose"
HELP_FIRE=$($CLI event fire --help)
echo "$HELP_FIRE" | grep -q -- "--now-ms" || fail "event fire --help missing --now-ms"
echo "$HELP_FIRE" | grep -q -- "--tick-ms" || fail "event fire --help missing --tick-ms"
pass "Save/reload + accurate --help"

echo ""
echo "=========================================="
echo -e "${GREEN}All P3 CLI tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified:"
echo "  ✓ Legacy sparse studio loads; event arrays migrate"
echo "  ✓ Event + binding CRUD (hit_received → Hurt)"
echo "  ✓ Preview-fire overlays pose; authored Idle not written"
echo "  ✓ Timed return at duration; hold policy stays; instant stays"
echo "  ✓ Wrong-parent / missing / wrong-game refs rejected"
echo "  ✓ In-use event/pose/state delete rejected"
echo "  ✓ Layer delete cascades bindings"
echo "  ✓ --help documents create/fire flags"
echo ""
echo "Repeated-event races / reset / shot-change are in eventPreview.test.ts (executed above)."
echo ""
echo "Manual Mac UI (not executed here):"
echo "  1. npm run dev, open Storyboards for the selected Game"
echo "  2. Background/Layers sidebar: Events section below layers"
echo "  3. Create event hit_received; bind character layer setPose Hurt, 0.5s default"
echo "  4. Fire: canvas shows Hurt, Starting pose dropdown still Idle"
echo "  5. After 0.5s returns to Idle; Fire twice quickly restarts timer"
echo "  6. Reset preview; change shot; stop playback — preview clears"
echo "  7. Delete event while bound is rejected; no window.prompt"
echo "  8. Camera & Effects tab still works; layer transforms/text/visibility unchanged"
