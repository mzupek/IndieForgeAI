#!/bin/bash
# A3 event SFX: playSfx bindings + preview fire (persisted:false).
# Isolated temp data only. Does NOT run Electron or claim host speaker audio.
# Does not touch real studio/media or Unity.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Event SFX (A3) verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: preview + validation + mixer (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/eventPreview.test.ts
echo ""
npx tsx src/shared/storyboard/eventValidation.test.ts
echo ""
npx tsx src/shared/storyboard/eventSfxPlayback.test.ts
echo ""
npx tsx src/shared/storyboard/audioValidation.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-event-sfx-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

audio_import_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['imported'][0]['id'])"
}

pose_id() {
  local slot="$1"
  python3 -c "import sys,json; d=json.load(sys.stdin); print(next(p['id'] for p in d if p['slot']=='$slot'))"
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

TEST_IMAGE="$TEST_DIR/test-image.png"
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
WAV="$TEST_DIR/hit.wav"
OUT="$WAV" DUR=0.4 python3 - <<'PY'
import math, os, pathlib, struct
sr, dur = 8000, float(os.environ['DUR'])
n = int(sr * dur)
samples = [int(12000 * math.sin(2 * math.pi * 880 * i / sr)) for i in range(n)]
data = b''.join(struct.pack('<h', s) for s in samples)
header = struct.pack(
    '<4sI4s4sIHHIIHH4sI',
    b'RIFF', 36 + len(data), b'WAVE', b'fmt ', 16,
    1, 1, sr, sr * 2, 2, 16,
    b'data', len(data)
)
pathlib.Path(os.environ['OUT']).write_bytes(header + data)
PY
[ -f "$TEST_IMAGE" ] && [ -f "$WAV" ] || fail "Failed to create fixtures"
pass "Synthetic PNG + WAV fixtures"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "A3 sparse studio",
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
pass "Legacy sparse studio.json written"

SB_OUT=$($CLI storyboard create --game game-test --name "A3 Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One" --duration 3)
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
HIT_IMP=$($CLI audio import "$WAV" --game game-test --kind sfx --name "Hit")
HIT_ID=$(echo "$HIT_IMP" | audio_import_id)
OTHER_IMP=$($CLI audio import "$WAV" --game game-other --kind sfx --name "Other Hit")
OTHER_ID=$(echo "$OTHER_IMP" | audio_import_id)
[ -n "$HIT_ID" ] && [ -n "$LAYER_ID" ] || fail "setup ids"
pass "Shot, Idle layer, Game-scoped hit SFX"

echo ""
echo "----------------------------------------"
echo "Test 1: same event pose + playSfx; fire reports both; authored JSON unchanged"
echo "----------------------------------------"
EVT_OUT=$($CLI event create --game game-test --name hit_received)
EVT_ID=$(echo "$EVT_OUT" | json_id)
POSE_BIND=$($CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --layer "$LAYER_ID" --action setPose --pose "$POSE_HURT" --duration 0.5 --return-policy default)
POSE_BIND_ID=$(echo "$POSE_BIND" | json_id)
SFX_BIND=$($CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --action playSfx --audio "$HIT_ID" --volume 0.8 --duration 0)
SFX_BIND_ID=$(echo "$SFX_BIND" | json_id)
echo "$SFX_BIND" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['action']['type']=='playSfx'
assert d['action']['audioId']=='$HIT_ID'
assert abs(d['action']['volume']-0.8)<1e-9
assert d.get('targetLayerId') in (None, '', False) or 'targetLayerId' not in d or not d.get('targetLayerId')
"

BEFORE=$(python3 -c "import json; d=json.load(open('$TEST_DIR/studio.json')); print(json.dumps(d['assetPipeline']['storyboardShots'], sort_keys=True))")
FIRE=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0)
echo "$FIRE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['persisted'] is False
assert d['fire']['matched']==2, d['fire']
assert d['fire']['sfxStarted']==1, d['fire']
assert d['snapshot']['overrides']['$LAYER_ID']['poseId']=='$POSE_HURT'
assert len(d['sfx'])==1, d['sfx']
assert d['sfx'][0]['audioId']=='$HIT_ID'
assert d['sfx'][0]['persisted'] is False
authored=next(x for x in d['authoredDefaults'] if x['id']=='$LAYER_ID')
assert authored['poseId']=='$POSE_IDLE', authored
"
AFTER=$(python3 -c "import json; d=json.load(open('$TEST_DIR/studio.json')); print(json.dumps(d['assetPipeline']['storyboardShots'], sort_keys=True))")
[ "$BEFORE" = "$AFTER" ] || fail "event fire mutated authored shots/audioTrack"
pass "Same event changes pose and reports SFX; persisted:false; JSON unchanged"

echo ""
echo "----------------------------------------"
echo "Test 2: expiry / hold / wrong-game / volume / missing / delete guard"
echo "----------------------------------------"
EXP=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0 --tick-ms 500)
echo "$EXP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['snapshot']['overrides'].get('$LAYER_ID') is None
assert d['sfx'][0]['audioId']=='$HIT_ID'
assert d['persisted'] is False
"

HOLD_EVT=$($CLI event create --game game-test --name hit_hold)
HOLD_EVT_ID=$(echo "$HOLD_EVT" | json_id)
HOLD_SFX=$($CLI binding create --game game-test --shot "$SHOT_ID" --event "$HOLD_EVT_ID" --action playSfx --audio "$HIT_ID" --duration 0.2 --return-policy hold)
HOLD_SFX_ID=$(echo "$HOLD_SFX" | json_id)
HOLD_FIRE=$($CLI event fire --game game-test --shot "$SHOT_ID" --event "$HOLD_EVT_ID" --now-ms 0 --tick-ms 10000)
echo "$HOLD_FIRE" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert len(d['sfx'])==1
assert d['sfx'][0]['stopOnExpiry'] is False
"

if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --action playSfx --audio "$OTHER_ID" 2>&1 | grep -q "belongs to game"; then
  pass "Wrong-game audio rejected"
else
  fail "Wrong-game playSfx was accepted"
fi

if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --action playSfx --audio missing-audio 2>&1 | grep -q "Audio not found"; then
  pass "Missing audio rejected"
else
  fail "Missing audio was accepted"
fi

if $CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --action playSfx --audio "$HIT_ID" --volume 1.5 2>&1 | grep -q "volume"; then
  pass "Bad volume rejected"
else
  fail "Out-of-range volume was accepted"
fi

if $CLI audio remove "$HIT_ID" --game game-test 2>&1 | grep -q "playSfx\|referenced"; then
  pass "In-use playSfx delete rejected"
else
  fail "In-use audio was deleted while playSfx binding exists"
fi

echo ""
echo "----------------------------------------"
echo "Test 3: layer delete keeps playSfx; CLI roundtrip + --help"
echo "----------------------------------------"
$CLI layer remove --shot "$SHOT_ID" --id "$LAYER_ID" >/dev/null
LIST_AFTER_LAYER=$($CLI binding list --shot "$SHOT_ID")
echo "$LIST_AFTER_LAYER" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert all(b['id']!='$POSE_BIND_ID' for b in d), d
assert any(b['id']=='$SFX_BIND_ID' for b in d), d
"
if $CLI event remove --id "$EVT_ID" 2>&1 | grep -q "referenced"; then
  pass "Event still referenced by playSfx after layer delete"
else
  fail "Event was deleted while playSfx binding remains"
fi
pass "Layer delete cascaded pose binding; playSfx kept"

echo ""
echo "----------------------------------------"
echo "Test 4: CLI roundtrip + --help"
echo "----------------------------------------"
SHOW_SFX=$($CLI binding show --id "$SFX_BIND_ID")
echo "$SHOW_SFX" | python3 -c "
import sys,json
t=sys.stdin.read()
i=min([x for x in (t.find('{'), t.find('[')) if x>=0])
d=json.loads(t[i:])
assert d['action']['type']=='playSfx', d
assert d['id']=='$SFX_BIND_ID', (d.get('id'), '$SFX_BIND_ID')
assert d['action']['audioId']=='$HIT_ID', d
"
$CLI binding list --shot "$SHOT_ID" | python3 -c "
import sys,json
t=sys.stdin.read()
i=min([x for x in (t.find('{'), t.find('[')) if x>=0])
d=json.loads(t[i:])
assert any(b['id']=='$SFX_BIND_ID' for b in d), d
assert all(b['id']!='$POSE_BIND_ID' for b in d), d
"
$CLI binding remove --id "$SFX_BIND_ID" >/dev/null
$CLI binding remove --id "$HOLD_SFX_ID" >/dev/null
$CLI audio remove "$HIT_ID" --game game-test >/dev/null
pass "Remove unused playSfx bindings then unused library audio"

HELP_BIND=$($CLI binding create --help)
echo "$HELP_BIND" | grep -q "playSfx" || fail "binding create --help missing playSfx"
echo "$HELP_BIND" | grep -q -- "--audio" || fail "binding create --help missing --audio"
echo "$HELP_BIND" | grep -q -- "--volume" || fail "binding create --help missing --volume"
HELP_FIRE=$($CLI event fire --help)
echo "$HELP_FIRE" | grep -q -- "--now-ms" || fail "event fire --help missing --now-ms"
pass "CLI --help documents playSfx / --audio / event fire"

echo ""
echo "=========================================="
echo -e "${GREEN}All A3 event SFX tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Preview engine: same event pose+SFX; repeat restart; expiry/hold/shot-change"
echo "  ✓ Validation: missing/wrong-game/volume; no layer required"
echo "  ✓ Mixer doubles: play/restart/overlap/stale play/ended/no loop"
echo "  ✓ CLI fire persisted:false; authored JSON unchanged"
echo "  ✓ Delete guard; layer delete keeps playSfx; --help"
echo ""
echo "NOT executed here: Mac Storyboard audible HTMLAudioElement.play() for event SFX."
