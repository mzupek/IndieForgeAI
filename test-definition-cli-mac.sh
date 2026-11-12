#!/bin/bash
# Game Definition CLI: forge definition / gamedef
# Isolated temp data only (mktemp + FORGE_DATA_DIR). Does not touch real studio/media.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Game Definition CLI verification"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit: merge patch + validation (tsx, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/gameDefinition/definitionPatch.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-definition-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"

json_field() {
  python3 -c "import sys,json; t=sys.stdin.read(); i=min([x for x in (t.find('{'), t.find('[')) if x>=0] or [0]); d=json.loads(t[i:]);
print(d$1)"
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

mkdir -p "$TEST_DIR"
cat > "$TEST_DIR/studio.json" << 'EOF'
{
  "schemaVersion": 1,
  "assetPipeline": {
    "schemaVersion": 1,
    "id": "studio",
    "name": "Definition CLI test",
    "description": "Isolated",
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
    "characters": [
      {
        "id": "char-hero",
        "gameId": "game-test",
        "name": "Hero",
        "role": "player",
        "tags": [],
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      },
      {
        "id": "char-other",
        "gameId": "game-other",
        "name": "Other",
        "role": "npc",
        "tags": [],
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "poses": [
      {
        "id": "pose-hero",
        "characterId": "char-hero",
        "slot": "ready",
        "file": "/tmp/hero-ready.png",
        "status": "approved",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      },
      {
        "id": "pose-other",
        "characterId": "char-other",
        "slot": "ready",
        "file": "/tmp/other-ready.png",
        "status": "approved",
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "clips": [
      {
        "id": "clip-hero",
        "characterId": "char-hero",
        "moment": "intro",
        "file": "/tmp/hero-intro.mp4",
        "durationSec": 2,
        "tags": [],
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "scenePresets": [
      {
        "id": "preset-shake",
        "type": "shake",
        "params": {},
        "tags": [],
        "createdAt": "2026-01-01T00:00:00.000Z",
        "updatedAt": "2026-01-01T00:00:00.000Z"
      }
    ],
    "scenes": [],
    "storyboards": [],
    "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": []
  }
}
EOF
pass "Isolated studio.json written"

echo ""
echo "----------------------------------------"
echo "Help + missing definition/game errors"
echo "----------------------------------------"
node out/cli/forge.js definition --help | grep -q "gamedef\|Game Definition" || fail "definition --help"
node out/cli/forge.js gamedef --help >/dev/null || fail "gamedef alias help"
pass "definition / gamedef help"

if SHOW_ERR=$($CLI definition show --game game-test 2>&1); then
  fail "show should fail before create"
else
  echo "$SHOW_ERR" | python3 -c "import sys,json; t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:]); assert d.get('error') is True; assert 'No game definition' in d['message']"
fi
pass "show errors when missing"

if MISS=$($CLI definition create --game game-missing 2>&1); then
  fail "create should fail for missing game"
else
  echo "$MISS" | python3 -c "import sys,json; t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:]); assert 'Game not found' in d['message']"
fi
pass "create errors for unknown game"

echo ""
echo "----------------------------------------"
echo "create / show / set / export"
echo "----------------------------------------"
CREATE=$($CLI definition create --game game-test)
echo "$CREATE" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['gameId']=='game-test'; assert d['stage']=='MVP'"
pass "create empty definition"

if DUP=$($CLI definition create --game game-test 2>&1); then
  fail "duplicate create should fail"
else
  echo "$DUP" | python3 -c "import sys,json; t=sys.stdin.read(); i=t.find('{'); d=json.loads(t[i:]); assert 'already has a definition' in d['message']"
fi
pass "create rejects second definition"

SHOW=$($CLI definition show --game game-test)
echo "$SHOW" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['gameId']=='game-test'"
STAGE=$($CLI definition show --game game-test --section stage)
echo "$STAGE" | python3 -c "import sys,json; assert json.load(sys.stdin)=='MVP'"
pass "show whole + --section stage"

$CLI gamedef set --game game-test --stage Beta >/dev/null
echo "$($CLI definition show --game game-test --section stage)" | python3 -c "import sys,json; assert json.load(sys.stdin)=='Beta'"
pass "gamedef set --stage"

echo 'Hack the pad over 3 rounds' > "$TEST_DIR/core.txt"
$CLI definition set --game game-test --puzzle-core-file "$TEST_DIR/core.txt" >/dev/null
echo "$($CLI definition show --game game-test --section puzzle-core)" | python3 -c "import sys,json; assert '3 rounds' in json.load(sys.stdin)"
echo 'Night city synopsis' | $CLI definition set --game game-test --story-synopsis - >/dev/null
echo "$($CLI definition show --game game-test --section story-synopsis)" | python3 -c "import sys,json; assert 'Night city' in json.load(sys.stdin)"
pass "set from file and stdin"

$CLI definition export --game game-test --format json --out "$TEST_DIR/def.json" >/dev/null
$CLI definition export --game game-test --format md --out "$TEST_DIR/def.md" >/dev/null
python3 -c "import json; d=json.load(open('$TEST_DIR/def.json')); assert d['gameId']=='game-test'"
grep -q "Stage:" "$TEST_DIR/def.md" || fail "markdown export missing Stage"
pass "export json + md to --out"

echo ""
echo "----------------------------------------"
echo "Lists: pillar, interaction, tuning, theme-slot, mvp, keep/cut/invent"
echo "----------------------------------------"
$CLI definition pillar add --game game-test --text "Readable fights" >/dev/null
$CLI definition pillar add --game game-test --text "One boss loop" >/dev/null
echo "$($CLI definition pillar list --game game-test)" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d[0]['text']=='Readable fights'"
$CLI definition pillar update --game game-test --index 1 --text "One pad loop" >/dev/null
$CLI definition pillar remove --game game-test --id "Readable fights" >/dev/null
echo "$($CLI definition pillar list --game game-test)" | python3 -c "import sys,json; d=json.load(sys.stdin); assert [x['text'] for x in d]==['One pad loop']"
pass "pillar add/update/remove/list"

INT=$($CLI definition interaction add --game game-test --name "Pad hack" --description "old" --asset-ref pad --asset-ref hud)
INT_ID=$(echo "$INT" | json_field "['id']")
$CLI definition interaction update --game game-test --id "$INT_ID" --description "3 locks" --asset-ref lock >/dev/null
echo "$($CLI definition interaction list --game game-test)" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d[0]['description']=='3 locks'; assert d[0]['assetRefs']==['lock']"
$CLI definition interaction remove --game game-test --id "$INT_ID" >/dev/null
echo "$($CLI definition interaction list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)==[]"
pass "interaction add/update/remove/list"

TUN=$($CLI definition tuning add --game game-test --name "Pad" --notes "simon" --param rounds=10 --param open=false)
TUN_ID=$(echo "$TUN" | json_field "['id']")
echo "$TUN" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['params']['rounds']==10; assert d['params']['open'] is False"
$CLI definition tuning update --game game-test --id "$TUN_ID" --param rounds=3 --param locks=3 --unset-param open --notes "3-lock" >/dev/null
echo "$($CLI definition tuning list --game game-test)" | python3 -c "
import sys,json
d=json.load(sys.stdin)[0]
assert d['params']['rounds']==3 and d['params']['locks']==3
assert 'open' not in d['params']
assert d['notes']=='3-lock'
"
$CLI definition tuning remove --game game-test --id "$TUN_ID" >/dev/null
pass "tuning params inferred + unset-param"

THEME=$($CLI definition theme-slot add --game game-test --name HUD --description locks --reference BattleHUD)
THEME_ID=$(echo "$THEME" | json_field "['id']")
$CLI definition theme-slot update --game game-test --id "$THEME_ID" --description "3 lock icons" >/dev/null
echo "$($CLI definition theme-slot list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)[0]['description']=='3 lock icons'"
$CLI definition theme-slot remove --game game-test --id "$THEME_ID" >/dev/null
pass "theme-slot add/update/remove/list"

MVP=$($CLI definition mvp add --game game-test --item "Lock icons" --type content --status needed --notes hud)
MVP_ID=$(echo "$MVP" | json_field "['id']")
$CLI definition mvp update --game game-test --id "$MVP_ID" --status partial --type asset >/dev/null
echo "$($CLI definition mvp list --game game-test)" | python3 -c "import sys,json; d=json.load(sys.stdin)[0]; assert d['status']=='partial' and d['type']=='asset'"
$CLI definition mvp remove --game game-test --id "$MVP_ID" >/dev/null
pass "mvp add/update/remove/list (content+asset types)"

$CLI definition keep add --game game-test --text "Arcade loop" >/dev/null
$CLI definition cut add --game game-test --text "Open world" >/dev/null
$CLI definition invent add --game game-test --text "3-lock pad" >/dev/null
$CLI definition keep remove --game game-test --index 0 >/dev/null
echo "$($CLI definition invent list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)[0]['text']=='3-lock pad'"
echo "$($CLI definition keep list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)==[]"
pass "keep/cut/invent add/remove/list"

echo ""
echo "----------------------------------------"
echo "cast + link validation (same game)"
echo "----------------------------------------"
$CLI definition cast add --game game-test --character char-hero >/dev/null
echo "$($CLI definition cast list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)==['char-hero']"
if BADCHAR=$($CLI definition cast add --game game-test --character char-other 2>&1); then
  fail "foreign character should be rejected"
else
  echo "$BADCHAR" | python3 -c "import sys; t=sys.stdin.read(); assert 'belongs to game' in t or 'not found' in t"
fi
$CLI definition cast remove --game game-test --character char-hero >/dev/null
pass "cast same-game validation"

$CLI definition link add --game game-test --pose pose-hero --clip clip-hero --preset preset-shake >/dev/null
echo "$($CLI definition link list --game game-test)" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['poses']==['pose-hero'] and d['clips']==['clip-hero'] and d['presets']==['preset-shake']
"
if BADPOSE=$($CLI definition link add --game game-test --pose pose-other 2>&1); then
  fail "foreign pose should be rejected"
else
  echo "$BADPOSE" | python3 -c "import sys; t=sys.stdin.read(); assert 'belongs to game' in t"
fi
$CLI definition link remove --game game-test --pose pose-hero --clip clip-hero --preset preset-shake >/dev/null
echo "$($CLI definition link list --game game-test)" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['poses']==[] and d['clips']==[] and d['presets']==[]
"
pass "link add/remove + pose game check"

echo ""
echo "----------------------------------------"
echo "apply --dry-run vs write"
echo "----------------------------------------"
BEFORE=$($CLI definition show --game game-test --section puzzle-core)
echo "$BEFORE" > "$TEST_DIR/before.json"
cat > "$TEST_DIR/patch.json" << 'EOF'
{
  "puzzleCore": "DRYRUN-SHOULD-NOT-PERSIST",
  "interactions": [
    { "name": "Open gate", "description": "all three locks", "assetRefs": ["gate"] }
  ],
  "tuningProfiles": [
    { "name": "Locks", "params": { "rounds": 3, "locks": 3 } }
  ]
}
EOF
DRY=$($CLI definition apply --game game-test --file "$TEST_DIR/patch.json" --dry-run)
echo "$DRY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['dryRun'] is True and d['written'] is False
assert d['definition']['puzzleCore']=='DRYRUN-SHOULD-NOT-PERSIST'
assert any(e['op']=='add' and e['path'].startswith('interactions[') for e in d['diff']['entries'])
"
AFTER_DRY=$($CLI definition show --game game-test --section puzzle-core)
echo "$AFTER_DRY" > "$TEST_DIR/after-dry.json"
python3 -c "import json; assert json.load(open('$TEST_DIR/before.json'))==json.load(open('$TEST_DIR/after-dry.json'))"
pass "dry-run reports diff and writes nothing"

APPLY=$($CLI definition apply --game game-test --file "$TEST_DIR/patch.json")
echo "$APPLY" | python3 -c "
import sys,json
d=json.load(sys.stdin)
assert d['written'] is True and d['dryRun'] is False
assert d['definition']['puzzleCore']=='DRYRUN-SHOULD-NOT-PERSIST'
assert len(d['definition']['interactions'])==1
assert d['definition']['tuningProfiles'][0]['params']['rounds']==3
"
echo "$($CLI definition show --game game-test --section puzzle-core)" | python3 -c "import sys,json; assert json.load(sys.stdin)=='DRYRUN-SHOULD-NOT-PERSIST'"
pass "apply writes merge patch (id-matched arrays)"

DEL_ID=$(echo "$APPLY" | python3 -c "import sys,json; print(json.load(sys.stdin)['definition']['interactions'][0]['id'])")
cat > "$TEST_DIR/delete.json" << EOF
{ "interactions": [{ "id": "$DEL_ID", "delete": true }] }
EOF
$CLI definition apply --game game-test --file "$TEST_DIR/delete.json" >/dev/null
echo "$($CLI definition interaction list --game game-test)" | python3 -c "import sys,json; assert json.load(sys.stdin)==[]"
pass "apply delete:true removes by id"

if BADPATCH=$(echo '{ "id": "nope" }' | $CLI definition apply --game game-test --file - 2>&1); then
  fail "identity patch should fail"
else
  echo "$BADPATCH" | python3 -c "import sys; t=sys.stdin.read(); assert 'Cannot change' in t"
fi
pass "apply rejects identity fields"

echo ""
echo "=========================================="
echo -e "${GREEN}All Game Definition CLI checks passed${NC}"
echo "=========================================="
