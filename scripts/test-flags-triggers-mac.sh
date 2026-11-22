#!/bin/bash
# Step 3 story flags, conditions, and triggers.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Step 3 flags, conditions, triggers"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/story/conditions.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-step3-flags-XXXXXX)
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
settings = {
  "poseSlots": [],
  "assetCategories": [],
  "encounterTypes": ["battle", "puzzle", "minigame", "story"],
  "modules": [{
    "id": "mini",
    "label": "Mini",
    "typeIds": ["minigame"]
  }]
}
studio = {
  "schemaVersion": 2,
  "createdAt": now,
  "updatedAt": now,
  "extraStudioFlag": True,
  "assetPipeline": {
    "schemaVersion": 2,
    "id": "studio",
    "name": "Studio",
    "description": "",
    "games": [
      {"id": "game-a", "name": "Game A", "engine": "unity", "exportRoot": "./exports/a", "settings": settings, "createdAt": now, "updatedAt": now},
      {"id": "game-b", "name": "Game B", "engine": "godot", "exportRoot": "./exports/b", "settings": settings, "createdAt": now, "updatedAt": now}
    ],
    "characters": [],
    "poses": [],
    "clips": [], "scenePresets": [], "scenes": [], "storyboards": [], "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "name": "Yard", "category": "background",
      "tags": [], "defaultStateId": None, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }], "assetStates": [], "fonts": [], "palettes": [],
    "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [{
      "id": "world-a", "gameId": "game-a", "key": "world-1", "name": "World 1", "order": 1,
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "stages": [{
      "id": "stage-intro", "gameId": "game-a", "worldId": "world-a", "key": "stage-intro",
      "name": "Intro", "order": 1, "entryRegionId": "r-intro", "entryAnchor": "a-start",
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }, {
      "id": "stage-gate", "gameId": "game-a", "worldId": "world-a", "key": "stage-gate",
      "name": "The Gate", "order": 2, "unlockAfter": ["stage-intro"],
      "entryRegionId": "r-gate",
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "encounters": [{
      "id": "enc-mini", "gameId": "game-a", "stageId": "stage-intro", "key": "enc-mini",
      "name": "Lane run", "typeId": "minigame", "moduleId": "mini",
      "stars": [], "order": 1, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "regions": [{
      "id": "r-intro", "gameId": "game-a", "stageId": "stage-intro", "key": "region-intro",
      "name": "Yard", "backgroundAssetId": "bg-a",
      "anchors": [{"id": "a-start", "pos": [0.12, 0.78]}, {"id": "a-lane", "pos": [0.5, 0.5]}],
      "edges": [["a-start", "a-lane"]], "spawn": "a-start",
      "hotspots": [{"id": "hs-mini", "anchor": "a-lane", "prompt": "Race", "encounterId": "enc-mini"}],
      "exits": [{"id": "x-map", "anchor": "a-start", "toWorldMap": True}],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }, {
      "id": "r-gate", "gameId": "game-a", "stageId": "stage-gate", "key": "region-gate",
      "name": "Approach", "backgroundAssetId": "bg-a",
      "anchors": [{"id": "a-start", "pos": [0.1, 0.8]}],
      "edges": [], "spawn": "a-start",
      "hotspots": [],
      "exits": [{"id": "x-map", "anchor": "a-start", "toWorldMap": True}],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "enemies": [], "attackTables": [], "difficultyProfiles": [],
    "flags": [], "triggers": [],
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
echo "Game-agnostic: no title-specific ids in Step 3 app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost|hoverboard' \
  src/shared/story \
  src/core/storage/flagService.ts \
  src/core/storage/triggerService.ts \
  src/cli/commands/flag.ts \
  src/cli/commands/trigger.ts \
  src/renderer/components/StoryView.tsx \
  src/renderer/components/ConditionBuilder.tsx \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into Step 3 app modules"
fi
pass "no game-specific strings in Step 3 modules"

echo ""
echo "----------------------------------------"
echo "Flag CRUD + dry-run + isolation"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI flag create --game game-a --name "Has board" --key has_board --type bool --default false --scope game --dry-run >/tmp/forge-s3-flag-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "flag --dry-run wrote studio.json"
$CLI flag create --game game-a --name "Has board" --key has_board --type bool --default false --scope game >/tmp/forge-s3-flag.json
$CLI flag create --game game-a --name Score --key score --type int --default 0 --scope world >/tmp/forge-s3-score.json
$CLI flag list --game game-a >/tmp/forge-s3-flist.json
python3 - <<'PY'
import json
flags = json.load(open("/tmp/forge-s3-flist.json"))["flags"]
keys = sorted(f["key"] for f in flags)
assert keys == ["has_board", "score"], keys
board = next(f for f in flags if f["key"] == "has_board")
assert board["type"] == "bool" and board["default"] is False and board["scope"] == "game"
score = next(f for f in flags if f["key"] == "score")
assert score["type"] == "int" and score["default"] == 0 and score["scope"] == "world"
print("two flags")
PY
$CLI flag update @has_board --game game-a --name "Has a board" >/tmp/forge-s3-flag-up.json
$CLI flag show @has_board --game game-a >/tmp/forge-s3-flag-show.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-s3-flag-show.json"))["record"]
assert rec["name"] == "Has a board"
print("flag update")
PY
$CLI flag list --game game-b >/tmp/forge-s3-flist-b.json
python3 - <<'PY'
import json
flags = json.load(open("/tmp/forge-s3-flist-b.json"))["flags"]
assert flags == [], flags
print("game-b isolated")
PY
if $CLI flag create --game game-a --name Dup --key has_board --type bool >/tmp/x.json 2>/tmp/x.err; then
  fail "duplicate flag key should fail"
fi
pass "flag CRUD, dry-run, isolation"

echo ""
echo "----------------------------------------"
echo "Trigger CRUD + condition/effects JSON"
echo "----------------------------------------"
$CLI trigger create --game game-a --name "Start race" --key start-race --kind onHotspot --source hs-mini \
  --condition '{"flag":{"flagId":"@has_board","op":"eq","value":true}}' \
  --effects '[{"startEncounter":{"encounterId":"@enc-mini"}}]' --once >/tmp/forge-s3-tr.json
$CLI trigger list --game game-a >/tmp/forge-s3-tlist.json
python3 - <<'PY'
import json
tr = json.load(open("/tmp/forge-s3-tlist.json"))["triggers"]
assert len(tr) == 1, tr
t = tr[0]
assert t["kind"] == "onHotspot" and t["once"] is True
assert t["condition"]["flag"]["op"] == "eq"
assert t["effects"][0]["startEncounter"]["encounterId"]
print("trigger saved")
PY
$CLI trigger update @start-race --game game-a --notes "from hotspot" >/tmp/forge-s3-tr-up.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-s3-tr-up.json"))["record"]
assert rec["notes"] == "from hotspot"
print("trigger update")
PY
pass "trigger CRUD"

echo ""
echo "----------------------------------------"
echo "Stage unlockCondition + encounter onWin"
echo "----------------------------------------"
$CLI stage update @stage-gate --game game-a --unlock-condition '{"flag":{"flagId":"@has_board","op":"eq","value":true}}' >/tmp/forge-s3-stage.json
$CLI encounter update @enc-mini --game game-a --on-win '[{"setFlag":{"flagId":"@score","value":1}}]' --on-lose '[]' >/tmp/forge-s3-enc.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
gate = next(s for s in studio["assetPipeline"]["stages"] if s["key"] == "stage-gate")
assert gate["unlockAfter"] == ["stage-intro"]
assert gate["unlockCondition"]["flag"]["op"] == "eq"
enc = next(e for e in studio["assetPipeline"]["encounters"] if e["key"] == "enc-mini")
assert enc["onWin"][0]["setFlag"]["value"] == 1
print("unlockCondition + onWin")
PY
pass "stage/encounter story fields"

echo ""
echo "----------------------------------------"
echo "hotspot.triggerId + in-use deletes"
echo "----------------------------------------"
$CLI region update @region-intro --game game-a --hotspots '[{"id":"hs-mini","anchor":"a-lane","prompt":"Race","encounterId":"enc-mini","triggerId":"@start-race"}]' >/tmp/forge-s3-region.json
if $CLI trigger remove @start-race --game game-a >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use trigger should refuse remove"
fi
grep -qi "Yard" /tmp/x.err /tmp/x.json || fail "trigger in-use error should name the region/hotspot"
if $CLI flag remove @has_board --game game-a >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use flag should refuse remove"
fi
grep -qiE "Start race|The Gate" /tmp/x.err /tmp/x.json || fail "flag in-use error should name users"
$CLI flag create --game game-a --name Spare --key spare --type bool >/tmp/forge-s3-spare.json
$CLI flag remove @spare --game game-a >/tmp/forge-s3-spare-rm.json
pass "in-use deletes refused; unused flag removed"

echo ""
echo "----------------------------------------"
echo "Flow preview: unlock condition, hotspot trigger, warnings"
echo "----------------------------------------"
$CLI world flow --game game-a @world-1 >/tmp/forge-s3-flow.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-s3-flow.json")))
assert "unlock:" in blob.lower() or "has_board" in blob, blob
assert "Start race" in blob, blob
assert "read but never set" in blob, blob
assert "set but never read" in blob, blob
print("flow summaries + flag usage")
PY
$CLI trigger create --game game-a --name Ghost --key ghost --kind onHotspot --source missing-hs --effects '[]' >/tmp/forge-s3-ghost.json
$CLI world flow --game game-a @world-1 >/tmp/forge-s3-flow-missing.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-s3-flow-missing.json")))
assert "missing" in blob.lower(), blob
print("missing source warning")
PY
$CLI stage update @stage-gate --game game-a --unlock-condition '{"all":[{"flag":{"flagId":"@has_board","op":"eq","value":true}},{"flag":{"flagId":"@has_board","op":"eq","value":false}}]}' >/tmp/forge-s3-never.json
$CLI world flow --game game-a @world-1 >/tmp/forge-s3-flow-never.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-s3-flow-never.json")))
assert "never pass" in blob.lower(), blob
print("never-pass warning")
PY
$CLI stage update @stage-gate --game game-a --unlock-condition '{"flag":{"flagId":"@has_board","op":"eq","value":true}}' >/tmp/forge-s3-stage-restore.json
$CLI trigger remove @ghost --game game-a >/tmp/forge-s3-ghost-rm.json
pass "flow warnings"

echo ""
echo "----------------------------------------"
echo "flow simulate: unlockAfter + unlockCondition; virtual hotspot"
echo "----------------------------------------"
$CLI flow simulate --game game-a --world @world-1 >/tmp/forge-s3-sim-off.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s3-sim-off.json"))["result"]
unlocked = [s["name"] for s in r["unlockedStages"]]
locked = [s["name"] for s in r["lockedStages"]]
assert "Intro" in unlocked, r
assert "The Gate" in locked, r
print("gate locked without flag")
PY
$CLI flow simulate --game game-a --world @world-1 --flags has_board=true >/tmp/forge-s3-sim-on.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s3-sim-on.json"))["result"]
unlocked = [s["name"] for s in r["unlockedStages"]]
assert "The Gate" in unlocked, r
names = [t["name"] for t in r["firingTriggers"]]
assert "Start race" in names, r
print("gate unlocked with flag; trigger fires")
PY
# encounterId shorthand still virtual when no triggerId on a hotspot
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
region = next(r for r in studio["assetPipeline"]["regions"] if r["key"] == "region-intro")
region["hotspots"].append({"id": "hs-extra", "anchor": "a-start", "prompt": "Look", "encounterId": "enc-mini"})
open(path, "w").write(json.dumps(studio, indent=2) + "\n")
PY
$CLI flow simulate --game game-a --world @world-1 --flags has_board=true >/tmp/forge-s3-sim-virt.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s3-sim-virt.json"))["result"]
virt = [t for t in r["firingTriggers"] if t.get("virtual")]
assert virt, r
assert any("start encounter" in t["effects"] for t in virt), virt
print("virtual hotspot.encounterId trigger")
PY
pass "simulate"

echo ""
echo "----------------------------------------"
echo "content export includes flags/triggers; apply 0 changes"
echo "----------------------------------------"
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-s3-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
assert any(f.get("key") == "has_board" for f in content["flags"]), content["flags"]
assert any(t.get("key") == "start-race" for t in content["triggers"]), content["triggers"]
gate = next(s for s in content["stages"] if s.get("key") == "stage-gate")
assert gate.get("unlockCondition"), gate
print("export flags/triggers, schema 1")
PY
BUNDLE="$TEST_DIR/bundle-s3.json"
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
flag = next(f for f in content["flags"] if f.get("key") == "has_board")
trig = next(t for t in content["triggers"] if t.get("key") == "start-race")
stage = next(s for s in content["stages"] if s.get("key") == "stage-gate")
enc = next(e for e in content["encounters"] if e.get("key") == "enc-mini")
bundle = {
  "flags": [{
    "key": flag["key"],
    "name": flag["name"],
    "type": flag["type"],
    "default": flag["default"],
    "scope": flag["scope"]
  }],
  "stages": [{
    "key": stage["key"],
    "worldId": "@world-1",
    "name": stage["name"],
    "order": stage["order"],
    "unlockAfter": ["@stage-intro"],
    "unlockCondition": {"flag": {"flagId": "@has_board", "op": "eq", "value": True}},
    "entryRegionId": "@region-gate"
  }],
  "encounters": [{
    "key": enc["key"],
    "stageId": "@stage-intro",
    "name": enc["name"],
    "typeId": enc["typeId"],
    "moduleId": enc["moduleId"],
    "stars": enc.get("stars") or [],
    "onWin": [{"setFlag": {"flagId": "@score", "value": 1}}]
  }],
  "triggers": [{
    "key": trig["key"],
    "name": trig["name"],
    "kind": trig["kind"],
    "sourceRef": "hs-mini",
    "once": trig["once"],
    "condition": {"flag": {"flagId": "@has_board", "op": "eq", "value": True}},
    "effects": [{"startEncounter": {"encounterId": "@enc-mini"}}],
    "notes": trig.get("notes")
  }]
}
open(os.path.join(os.environ["FORGE_DATA_DIR"], "bundle-s3.json"), "w").write(json.dumps(bundle, indent=2) + "\n")
PY
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-s3-apply-dry.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-s3-apply.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-s3-re.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s3-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
pass "export flags/triggers, apply idempotent"

echo ""
echo -e "${GREEN}✓ Step 3 flags/triggers tests passed${NC}"
