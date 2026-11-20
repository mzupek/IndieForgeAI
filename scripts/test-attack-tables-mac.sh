#!/bin/bash
# 2b attack tables + module attackKinds/counterKinds.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "2b attack tables"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/attackTables/validate.test.ts
echo ""
npx tsx src/shared/attackTables/formSave.test.ts
echo ""
npx tsx src/shared/attackTables/simulate.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/attackTableService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-2b-table-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"
STUDIO="$TEST_DIR/studio.json"

fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
pass() { echo -e "${GREEN}✓ $1${NC}"; }

cleanup() { rm -rf "$TEST_DIR"; }
trap cleanup EXIT

mkdir -p "$TEST_DIR"
python3 - <<'PY'
import json, os
now = "2026-01-01T00:00:00.000Z"
settings_a = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "pad",
    "label": "Pad",
    "typeIds": ["battle"],
    "starKinds": ["win"],
    "winConditions": ["locks"]
  }]
}
settings_b = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "duel",
    "label": "Duel",
    "typeIds": ["battle"]
  }]
}
studio = {
  "schemaVersion": 2,
  "createdAt": now,
  "updatedAt": now,
  "assetPipeline": {
    "schemaVersion": 2,
    "id": "studio",
    "name": "Studio",
    "description": "",
    "games": [
      {"id": "game-a", "name": "Game A", "engine": "unity", "exportRoot": "./exports/a", "settings": settings_a, "createdAt": now, "updatedAt": now},
      {"id": "game-b", "name": "Game B", "engine": "godot", "exportRoot": "./exports/b", "settings": settings_b, "createdAt": now, "updatedAt": now}
    ],
    "characters": [
      {
        "id": "char-a", "gameId": "game-a", "key": "scout", "name": "Scout", "role": "enemy",
        "tags": [], "poseSlots": [{"key": "attack_arc", "label": "Arc"}],
        "createdAt": now, "updatedAt": now
      },
      {
        "id": "char-b", "gameId": "game-b", "name": "Other", "role": "npc", "tags": [],
        "createdAt": now, "updatedAt": now
      }
    ],
    "poses": [
      {
        "id": "pose-arc", "characterId": "char-a", "slot": "attack_arc", "file": "/tmp/arc.png",
        "status": "approved", "source": "import", "createdAt": now, "updatedAt": now
      },
      {
        "id": "pose-hurt", "characterId": "char-a", "slot": "hurt", "file": "/tmp/hurt.png",
        "status": "approved", "source": "import", "createdAt": now, "updatedAt": now
      }
    ],
    "clips": [], "scenePresets": [], "scenes": [], "storyboards": [], "storyboardShots": [],
    "exportProfiles": [], "gameDefinitions": [], "visualAssets": [], "assetStates": [],
    "fonts": [], "palettes": [],
    "eventDefinitions": [
      {"id": "evt-jam", "gameId": "game-a", "key": "jam", "name": "Jam cue", "schemaVersion": 1, "createdAt": now, "updatedAt": now}
    ],
    "eventBindings": [],
    "audioAssets": [
      {"id": "aud-zap", "gameId": "game-a", "name": "Zap", "kind": "sfx", "tags": [], "file": "/tmp/zap.wav", "durationSec": 0.2, "schemaVersion": 1, "createdAt": now, "updatedAt": now}
    ],
    "worlds": [], "stages": [], "encounters": [], "regions": [], "enemies": [],
    "createdAt": now, "updatedAt": now
  }
}
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
with open(path, "w") as f:
    json.dump(studio, f, indent=2)
    f.write("\n")
PY
pass "v2 two-game fixture (no title names)"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

echo ""
echo "----------------------------------------"
echo "Game-agnostic: no title-specific ids in 2b app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost' \
  src/shared/attackTables \
  src/core/storage/attackTableService.ts \
  src/cli/commands/attackTable.ts \
  src/renderer/components/AttackTablesPanel.tsx \
  src/renderer/components/EnemiesView.tsx \
  src/renderer/components/GameSettingsView.tsx \
  src/shared/gameSettings/encounterSettings.ts \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 2b app modules"
fi
pass "no game-specific strings in 2b modules"

echo ""
echo "----------------------------------------"
echo "Module attack kinds + counter kinds"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI game module attack-kind add pad --game game-a --key damage --label Damage --dry-run >/tmp/forge-2b-ak-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "attack-kind --dry-run wrote studio.json"
$CLI game module attack-kind add pad --game game-a --key damage --label Damage
$CLI game module attack-kind add pad --game game-a --key extendPattern --label Extend --param by:number:1:3
$CLI game module counter-kind add pad --game game-a --key perfectRound --label Perfect
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
mod = next(m for m in studio["assetPipeline"]["games"][0]["settings"]["modules"] if m["id"] == "pad")
keys = [k["key"] for k in mod["attackKinds"]]
assert keys == ["damage", "extendPattern"], keys
ext = next(k for k in mod["attackKinds"] if k["key"] == "extendPattern")
assert ext["params"][0] == {"key": "by", "type": "number", "min": 1, "max": 3}, ext
assert [k["key"] for k in mod["counterKinds"]] == ["perfectRound"]
print("kinds saved")
PY
pass "attack/counter kinds (dry-run byte-identical, camelCase kept)"

echo ""
echo "----------------------------------------"
echo "Attack table CRUD + rows"
echo "----------------------------------------"
$CLI attack-table create --game game-a --name "Gate pattern" --module pad --key gate \
  --selection weighted --forbid-repeat --skip-final-round >/tmp/forge-2b-create.json
TABLE_ID=$(python3 -c "import json; print(json.load(open('/tmp/forge-2b-create.json'))['record']['id'])")
$CLI attack-table row add @gate --game game-a --id taser_arc --label "Taser Arc" --kind damage \
  --weight 60 --damage 8 --counter-kind perfectRound --counter-result cancel \
  --pose attack_arc --hero-pose hurt --cue @jam --sfx Zap
$CLI attack-table row add @gate --game game-a --id scan_jam --label "Scan Jam" --kind extendPattern \
  --weight 25 --param by=1 --min-round 2 --counter-kind perfectRound --counter-result cancel
$CLI attack-table row add @gate --game game-a --id alarm_pulse --label "Alarm Pulse" --kind damage \
  --weight 15 --damage 12 --min-round 2 --counter-kind perfectRound --counter-result halve
$CLI attack-table show @gate --game game-a >/tmp/forge-2b-show.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-2b-show.json"))["record"]
assert rec["key"] == "gate"
assert rec["selection"] == "weighted"
assert rec["noRepeatInARow"] is True
assert rec["skipFinalRound"] is True
assert rec["reveal"] == "roundStart"
ids = [r["id"] for r in rec["rows"]]
assert ids == ["taser_arc", "scan_jam", "alarm_pulse"], ids
assert rec["rows"][0]["cueEventId"] == "evt-jam"
assert rec["rows"][0]["sfxAudioId"] == "aud-zap"
print("table rows ok")
PY
pass "create table + three rows + cue/sfx resolve"

echo ""
echo "----------------------------------------"
echo "Validation: range, weight, unknown kind"
echo "----------------------------------------"
if $CLI attack-table row add @gate --game game-a --label Bad --kind extendPattern --weight 10 --param by=5 >/tmp/forge-2b-by.json 2>/tmp/forge-2b-by.err; then
  fail "extendPattern by=5 should be refused"
fi
grep -q "must be <= 3" /tmp/forge-2b-by.err || fail "range error message"
if $CLI attack-table row add @gate --game game-a --label Zero --kind damage --weight 0 >/tmp/forge-2b-w.json 2>/tmp/forge-2b-w.err; then
  fail "weight 0 should be refused"
fi
grep -q "greater than 0" /tmp/forge-2b-w.err || fail "weight error message"
if $CLI attack-table row add @gate --game game-a --label Laser --kind laser --weight 10 >/tmp/forge-2b-k.json 2>/tmp/forge-2b-k.err; then
  fail "unknown kind should be refused"
fi
grep -q "not in module 'pad' attackKinds" /tmp/forge-2b-k.err || fail "kind error message"
pass "plain validation messages"

echo ""
echo "----------------------------------------"
echo "Simulate seed 42 / determinism / weight change"
echo "----------------------------------------"
$CLI attack-table simulate @gate --game game-a --rounds 3 --seed 42 >/tmp/forge-2b-sim.json
$CLI attack-table simulate @gate --game game-a --rounds 3 --seed 42 >/tmp/forge-2b-sim2.json
python3 - <<'PY'
import json
a = json.load(open("/tmp/forge-2b-sim.json"))
b = json.load(open("/tmp/forge-2b-sim2.json"))
assert a["results"][0]["picked"]["id"] == "taser_arc", a
assert a["results"][2]["skipped"] is True, a
assert a["results"] == b["results"]
print("seed 42 deterministic; round 1 taser; round 3 skipped")
PY
$CLI attack-table row update @gate alarm_pulse --game game-a --weight 80 >/tmp/forge-2b-wchg.json
$CLI attack-table simulate @gate --game game-a --rounds 3 --seed 42 >/tmp/forge-2b-sim3.json
python3 - <<'PY'
import json
a = json.load(open("/tmp/forge-2b-sim.json"))
c = json.load(open("/tmp/forge-2b-sim3.json"))
assert c["results"][0]["picked"]["id"] == "taser_arc"
assert c["results"][1]["picked"]["id"] != a["results"][1]["picked"]["id"], (a, c)
print("weight change changes round 2 pick")
PY
$CLI attack-table row update @gate alarm_pulse --game game-a --weight 15 >/tmp/forge-2b-wback.json
pass "simulate rules + determinism"

echo ""
echo "----------------------------------------"
echo "Enemy picker, checklist, in-use removals"
echo "----------------------------------------"
$CLI enemy create --game game-a --name Scout --character Scout --module pad --win locks \
  --key scout-en --attack-table @gate >/tmp/forge-2b-en.json
$CLI enemy checklist @scout-en --game game-a >/tmp/forge-2b-check.json
python3 - <<'PY'
import json
c = json.load(open("/tmp/forge-2b-check.json"))
slots = {p["slot"]: p for p in c["poses"]}
assert "attack_arc" in slots, c
assert slots["attack_arc"]["have"] is True
assert "Taser Arc" in slots["attack_arc"]["usedBy"]
assert c["cueEvents"][0]["have"] is True
assert "Taser Arc" in c["cueEvents"][0]["usedBy"]
assert c["sfx"][0]["have"] is True
print("checklist attack pose / cue / sfx")
PY
if $CLI attack-table remove @gate --game game-a >/tmp/forge-2b-trm.json 2>/tmp/forge-2b-trm.err; then
  fail "table in use should be refused"
fi
grep -qi "in use" /tmp/forge-2b-trm.err || fail "table in-use message"
if $CLI game module attack-kind remove pad --game game-a --key damage >/tmp/forge-2b-akrm.json 2>/tmp/forge-2b-akrm.err; then
  fail "attack kind in use should be refused"
fi
grep -qi "damage" /tmp/forge-2b-akrm.err || fail "attack kind in-use message"
if $CLI event remove --id evt-jam >/tmp/forge-2b-evrm.json 2>/tmp/forge-2b-evrm.err; then
  fail "event in use should be refused"
fi
grep -qi "in use\|referenced" /tmp/forge-2b-evrm.err || fail "event in-use message"
if $CLI audio remove aud-zap --game game-a >/tmp/forge-2b-aum.json 2>/tmp/forge-2b-aum.err; then
  fail "audio in use should be refused"
fi
grep -qi "referenced\|in use" /tmp/forge-2b-aum.err || fail "audio in-use message"
pass "in-use removals refused"

echo ""
echo "----------------------------------------"
echo "Dry-run byte-identical + save keeps arrays"
echo "----------------------------------------"
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
studio["extraStudioFlag"] = True
studio["assetPipeline"]["attackTables"][0]["futureFlag"] = "keep-me"
json.dump(studio, open(path, "w"), indent=2)
open(path, "a").write("\n")
PY
BEFORE=$(hash_of "$STUDIO")
$CLI attack-table update @gate --game game-a --name "Dry" --dry-run >/tmp/forge-2b-tdry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "attack-table --dry-run wrote studio.json"
$CLI attack-table update @gate --game game-a --name "Gate pattern" >/tmp/forge-2b-tupd.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
t = studio["assetPipeline"]["attackTables"][0]
assert t["futureFlag"] == "keep-me", t
assert t["name"] == "Gate pattern", t
assert studio["extraStudioFlag"] is True
for name in ("worlds", "stages", "encounters", "regions", "enemies", "attackTables"):
    assert isinstance(studio["assetPipeline"][name], list), name
print("overlay + arrays kept")
PY
pass "dry-run byte-identical; unknown fields and arrays kept"

echo ""
echo "----------------------------------------"
echo "Second game isolated + content apply/export"
echo "----------------------------------------"
$CLI attack-table list --game game-b >/tmp/forge-2b-b.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2b-b.json"))["attackTables"]
assert rows == [], rows
print("game-b empty")
PY
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-2b-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
assert len(content["attackTables"]) == 1, content["attackTables"]
assert content["attackTables"][0]["key"] == "gate"
print("export attackTables + schema 1")
PY
$CLI content apply --game game-a --file "$TEST_DIR/export-a/content.json" >/tmp/forge-2b-apply.json
python3 - <<'PY'
import json
res = json.load(open("/tmp/forge-2b-apply.json"))
assert res["creates"] == [], res
print("apply idempotent")
PY
pass "game isolation, content apply/export idempotent"

echo ""
echo -e "${GREEN}✓ 2b attack table tests passed${NC}"
