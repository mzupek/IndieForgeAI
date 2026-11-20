#!/bin/bash
# Timeline event cues: authored shot.eventCues + CLI roundtrip.
# Isolated temp data only. Does NOT run Electron or claim host speaker audio.
# Does not touch real studio/media or Unity.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Event cues (timeline Play fire) verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: crossing + validation + 6-track hit (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/storyboard/eventCuePlayback.test.ts
echo ""
npx tsx src/shared/storyboard/eventCues.test.ts
echo ""
npx tsx src/shared/storyboard/timelinePointer.test.ts
echo ""
npx tsx src/shared/storyboard/shotDuration.test.ts
echo ""
npx tsx src/shared/storyboard/eventSfxPlayback.test.ts
echo ""
npx tsx src/shared/storyboard/pointerCapture.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-event-cues-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]);
print(d['id'] if isinstance(d, dict) else d[0]['id'])"
}

cue_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['cue']['id'])"
}

audio_import_id() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0]); d=json.loads(t[i:]); print(d['imported'][0]['id'])"
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
[ -f "$WAV" ] || fail "Failed to create WAV fixture"
pass "Synthetic WAV fixture"

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "legacy-project",
    "name": "Legacy",
    "description": "Event-cue sparse studio",
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
    "gameDefinitions": []
  }
}
EOF
pass "Legacy sparse studio.json written"

SB_OUT=$($CLI storyboard create --game game-test --name "Cue Board")
SB_ID=$(echo "$SB_OUT" | json_id)
SHOT_OUT=$($CLI shot add --storyboard "$SB_ID" --name "Shot One" --duration 4)
SHOT_ID=$(echo "$SHOT_OUT" | json_id)
HIT_IMP=$($CLI audio import "$WAV" --game game-test --kind sfx --name "Beep")
HIT_ID=$(echo "$HIT_IMP" | audio_import_id)
EVT_OUT=$($CLI event create --game game-test --name button_touch)
EVT_ID=$(echo "$EVT_OUT" | json_id)
[ -n "$SHOT_ID" ] && [ -n "$EVT_ID" ] && [ -n "$HIT_ID" ] || fail "setup ids"
pass "Shot + button_touch event + library SFX"

echo ""
echo "----------------------------------------"
echo "Test 1: unbound add warns; bound add persists; list/show/update/remove"
echo "----------------------------------------"
UNBOUND=$($CLI shot event-cue add --shot "$SHOT_ID" --event "$EVT_ID" --time 1.25)
echo "$UNBOUND" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['cue']['eventId']=='$EVT_ID'
assert abs(d['cue']['t']-1.25)<1e-9
assert d['cue']['schemaVersion']==1
assert 'no bindings' in (d.get('warning') or ''), d
"
UNBOUND_ID=$(echo "$UNBOUND" | cue_id)
pass "Unbound cue warns and still persists"

$CLI shot event-cue remove --id "$UNBOUND_ID" >/dev/null
$CLI binding create --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --action playSfx --audio "$HIT_ID" --volume 1 --duration 0 >/dev/null

ADD=$($CLI shot event-cue add --shot "$SHOT_ID" --event "$EVT_ID" --time 1.2)
echo "$ADD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['cue']['eventId']=='$EVT_ID'
assert abs(d['cue']['t']-1.2)<1e-9
assert not d.get('warning'), d
"
CUE_ID=$(echo "$ADD" | cue_id)
[ -n "$CUE_ID" ] || fail "cue id"

LIST=$($CLI shot event-cue list --shot "$SHOT_ID")
echo "$LIST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert len(d)==1 and d[0]['id']=='$CUE_ID'
"

SHOW=$($CLI shot event-cue show --id "$CUE_ID")
echo "$SHOW" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['shotId']=='$SHOT_ID'
assert d['cue']['id']=='$CUE_ID'
"

UPD=$($CLI shot event-cue update --id "$CUE_ID" --time 2.0)
echo "$UPD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert abs(d['cue']['t']-2.0)<1e-9
assert d['cue']['eventId']=='$EVT_ID'
"
pass "add/list/show/update roundtrip"

echo ""
echo "----------------------------------------"
echo "Test 2: validation + shrink guard + event-delete in-use"
echo "----------------------------------------"
if $CLI shot event-cue add --shot "$SHOT_ID" --event "$EVT_ID" --time 9 2>&1 | grep -q "after shot duration"; then
  pass "Cue past shot duration rejected"
else
  fail "Out-of-range cue time was accepted"
fi

if $CLI shot event-cue add --shot "$SHOT_ID" --event missing-event --time 1 2>&1 | grep -q "Event not found"; then
  pass "Unknown event rejected"
else
  fail "Missing event was accepted"
fi

if $CLI shot update --id "$SHOT_ID" --duration 1 2>&1 | grep -q "event cue"; then
  pass "Shot-shrink blocked by event cue"
else
  fail "Shot shrink silently truncated event cue"
fi

if $CLI event remove --id "$EVT_ID" 2>&1 | grep -q "referenced"; then
  pass "Event delete blocked while cue exists"
else
  fail "Event was deleted while a cue still points at it"
fi

BEFORE=$(python3 -c "import json; d=json.load(open('$TEST_DIR/studio.json')); print(json.dumps(d['assetPipeline']['storyboardShots'][0].get('eventCues'), sort_keys=True))")
$CLI event fire --game game-test --shot "$SHOT_ID" --event "$EVT_ID" --now-ms 0 >/dev/null
AFTER=$(python3 -c "import json; d=json.load(open('$TEST_DIR/studio.json')); print(json.dumps(d['assetPipeline']['storyboardShots'][0].get('eventCues'), sort_keys=True))")
[ "$BEFORE" = "$AFTER" ] || fail "event fire mutated eventCues"
pass "Fire still works; cues not mutated"

$CLI shot event-cue remove --id "$CUE_ID" >/dev/null
LIST_EMPTY=$($CLI shot event-cue list --shot "$SHOT_ID")
echo "$LIST_EMPTY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d==[] or d=={} or len(d)==0
"
pass "remove deletes the cue only"

echo ""
echo "----------------------------------------"
echo "Test 3: CLI --help"
echo "----------------------------------------"
HELP_PARENT=$(node out/cli/forge.js shot event-cue --help)
echo "$HELP_PARENT" | grep -q "add" || fail "event-cue --help missing add"
echo "$HELP_PARENT" | grep -q "list" || fail "event-cue --help missing list"
echo "$HELP_PARENT" | grep -q "update" || fail "event-cue --help missing update"
echo "$HELP_PARENT" | grep -q "remove" || fail "event-cue --help missing remove"
HELP_ADD=$(node out/cli/forge.js shot event-cue add --help)
echo "$HELP_ADD" | grep -q -- "--event" || fail "event-cue add --help missing --event"
echo "$HELP_ADD" | grep -q -- "--time" || fail "event-cue add --help missing --time"
echo "$HELP_ADD" | grep -q -- "--shot" || fail "event-cue add --help missing --shot"
pass "CLI --help documents event-cue add/list/update/remove"

echo ""
echo "=========================================="
echo -e "${GREEN}All event cue tests passed${NC}"
echo "=========================================="
echo ""
echo "Verified (automated, no Electron UI):"
echo "  ✓ Crossing: forward once, pause/reverse/seek skip, loop re-arm, same-t multi"
echo "  ✓ Preview fire all bindings + SFX doubles; reset cancel; no authored mutation"
echo "  ✓ CLI add/list/show/update/remove; unbound warn; duration/event/shrink/in-use"
echo "  ✓ Fire button path (event fire) still persisted:false"
echo ""
echo "NOT executed here: Mac Storyboard Play audible crossing of Events-track cues."
