#!/bin/bash
# 2c encounter enemy links + difficulty profiles.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "2c encounter links + difficulty"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/difficulty/validate.test.ts
echo ""
npx tsx src/shared/worldContent/encounterLinks.test.ts
echo ""
npx tsx --tsconfig tsconfig.node.json src/core/storage/difficultyService.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-2c-enc-XXXXXX)
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
    "winConditions": ["locks", "enemyHp"]
  }, {
    "id": "duel",
    "label": "Duel",
    "typeIds": ["battle"]
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
  "extraStudioFlag": True,
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
        "tags": [], "poseSlots": [{"key": "arc", "label": "Arc"}],
        "createdAt": now, "updatedAt": now
      }
    ],
    "poses": [],
    "clips": [], "scenePresets": [], "scenes": [], "storyboards": [], "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [{
      "id": "def-a", "gameId": "game-a", "stage": "MVP", "pillars": [], "puzzleCore": "",
      "storySynopsis": "", "cast": [], "linkedAssets": {"poses": [], "clips": [], "presets": []},
      "themeSlots": [], "interactions": [],
      "tuningProfiles": [{"id": "tune-a", "name": "Pad Tune", "params": {"enemyHP": 20, "rounds": 10}}],
      "keepCutInvent": {"keep": [], "cut": [], "invent": []}, "mvpBoard": [], "markdownSource": "",
      "createdAt": now, "updatedAt": now
    }],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "name": "Alley", "category": "background",
      "tags": [], "defaultStateId": None, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }], "assetStates": [], "fonts": [], "palettes": [],
    "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [{
      "id": "world-a", "gameId": "game-a", "key": "world-1", "name": "World 1", "order": 1,
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "stages": [{
      "id": "stage-a", "gameId": "game-a", "worldId": "world-a", "key": "stage-gate",
      "name": "The Gate", "order": 1, "entryRegionId": "r-a", "entryAnchor": "a-start",
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "encounters": [{
      "id": "enc-a", "gameId": "game-a", "stageId": "stage-a", "key": "enc-pad",
      "name": "Pad fight", "typeId": "battle", "moduleId": "pad",
      "tuningProfileId": "tune-a", "stars": [{"id": "s1", "label": "Win", "kind": "win"}],
      "order": 1, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "regions": [{
      "id": "r-a", "gameId": "game-a", "stageId": "stage-a", "key": "region-gate",
      "name": "Approach", "backgroundAssetId": "bg-a",
      "anchors": [{"id": "a-start", "pos": [0.12, 0.78]}, {"id": "a-gate", "pos": [0.8, 0.7]}],
      "edges": [["a-start", "a-gate"]], "spawn": "a-start",
      "hotspots": [{"id": "hs-1", "anchor": "a-gate", "prompt": "Hack", "encounterId": "enc-a"}],
      "exits": [{"id": "x-map", "anchor": "a-start", "toWorldMap": True}],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "enemies": [], "attackTables": [], "difficultyProfiles": [],
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
echo "Game-agnostic: no title-specific ids in 2c app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost' \
  src/shared/difficulty \
  src/core/storage/difficultyService.ts \
  src/cli/commands/difficulty.ts \
  src/renderer/components/DifficultyPanel.tsx \
  src/shared/worldContent/encounterLinks.ts \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into 2c app modules"
fi
pass "no game-specific strings in 2c modules"

echo ""
echo "----------------------------------------"
echo "Seed enemy + attack table"
echo "----------------------------------------"
$CLI game module attack-kind add --game game-a pad --key damage --label Damage >/tmp/forge-2c-kind.json
$CLI attack-table create --game game-a --name "Pad table" --module pad --key pad-table >/tmp/forge-2c-table.json
$CLI enemy create --game game-a --name Scout --character Scout --module pad --win locks \
  --win-param count=3 --key scout-en >/tmp/forge-2c-enemy.json
pass "enemy + table ready"

echo ""
echo "----------------------------------------"
echo "Difficulty CRUD + range refusals"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI difficulty create --game game-a --name Story --key story \
  --hero-hp-multiplier 1.5 --playback-speed 0.85 --attack-weight-scale 0.75 --hint-charges 3 \
  --dry-run >/tmp/forge-2c-diff-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "difficulty --dry-run wrote studio.json"
$CLI difficulty create --game game-a --name Story --key story \
  --hero-hp-multiplier 1.5 --playback-speed 0.85 --attack-weight-scale 0.75 --hint-charges 3 \
  >/tmp/forge-2c-story.json
$CLI difficulty create --game game-a --name Normal --key normal \
  --hero-hp-multiplier 1 --playback-speed 1 --attack-weight-scale 1 --hint-charges 1 \
  >/tmp/forge-2c-normal.json
$CLI difficulty create --game game-a --name Hard --key hard \
  --hero-hp-multiplier 0.7 --playback-speed 1.15 --attack-weight-scale 1.25 --hint-charges 0 \
  >/tmp/forge-2c-hard.json
$CLI difficulty list --game game-a >/tmp/forge-2c-dlist.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2c-dlist.json"))["difficultyProfiles"]
assert len(rows) == 3, rows
keys = {r["key"] for r in rows}
assert keys == {"story", "normal", "hard"}, keys
print("three profiles")
PY
if $CLI difficulty create --game game-a --name Bad --hero-hp-multiplier 0 >/tmp/x.json 2>/tmp/x.err; then
  fail "multiplier 0 should fail"
fi
if $CLI difficulty create --game game-a --name Bad --hint-charges 1.5 >/tmp/x.json 2>/tmp/x.err; then
  fail "fractional hintCharges should fail"
fi
pass "difficulty CRUD + range refusals"

echo ""
echo "----------------------------------------"
echo "Encounter enemies + difficulty; module match"
echo "----------------------------------------"
$CLI encounter update @enc-pad --game game-a --enemy @scout-en=@pad-table >/tmp/forge-2c-enc.json
python3 - <<'PY'
import json
enc = json.load(open("/tmp/forge-2c-enc.json"))["record"]
assert enc["enemies"][0]["enemyId"]
assert enc["enemies"][0]["attackTableId"]
assert "difficultyProfileId" not in enc or not enc.get("difficultyProfileId")
print("enemy linked, difficulty empty")
PY
$CLI game module update --game game-a duel --win-conditions locks >/tmp/forge-2c-duel-mod.json
$CLI enemy create --game game-a --name Duelist --character Scout --module duel --win locks \
  --win-param count=1 --key duelist >/tmp/forge-2c-duel.json
if $CLI encounter update @enc-pad --game game-a --enemy @duelist >/tmp/x.json 2>/tmp/x.err; then
  fail "wrong-module enemy should be refused"
fi
grep -qi module /tmp/x.err /tmp/x.json || fail "wrong-module error should mention module"
pass "wrong-module enemy refused"
$CLI encounter update @enc-pad --game game-a --enemy @scout-en --difficulty @story >/tmp/forge-2c-enc-d.json
python3 - <<'PY'
import json
enc = json.load(open("/tmp/forge-2c-enc-d.json"))["record"]
assert enc.get("difficultyProfileId")
print("difficulty set")
PY
$CLI encounter update @enc-pad --game game-a --difficulty "" >/tmp/forge-2c-enc-clear.json
python3 - <<'PY'
import json
enc = json.load(open("/tmp/forge-2c-enc-clear.json"))["record"]
assert not enc.get("difficultyProfileId"), enc
print("difficulty cleared (player's choice)")
PY
pass "encounter enemy/difficulty flags"

echo ""
echo "----------------------------------------"
echo "In-use delete refused and names the encounter"
echo "----------------------------------------"
$CLI encounter update @enc-pad --game game-a --enemy @scout-en=@pad-table --difficulty @story >/tmp/forge-2c-link.json
if $CLI enemy remove --game game-a @scout-en >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use enemy should refuse remove"
fi
grep -qi "Pad fight" /tmp/x.err /tmp/x.json || fail "enemy in-use error should name the encounter"
if $CLI attack-table remove --game game-a @pad-table >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use attack table should refuse remove"
fi
grep -qi "Pad fight" /tmp/x.err /tmp/x.json || fail "table in-use error should name the encounter"
if $CLI difficulty remove --game game-a @story >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use difficulty should refuse remove"
fi
grep -qi "Pad fight" /tmp/x.err /tmp/x.json || fail "difficulty in-use error should name the encounter"
pass "in-use deletes refused"

echo ""
echo "----------------------------------------"
echo "Flow preview: lead enemy + checklist warning"
echo "----------------------------------------"
$CLI world flow --game game-a @world-1 >/tmp/forge-2c-flow.json
python3 - <<'PY'
import json
flow = json.load(open("/tmp/forge-2c-flow.json"))
blob = json.dumps(flow)
assert "Scout" in blob, blob
assert "Pad fight" in blob, blob
assert "checklist is not ready" in blob, blob
assert "enemyHP=20" in blob and "locks" in blob, blob
print("flow lead + checklist warning + tuning conflict")
PY
pass "flow preview flags lead enemy checklist"

echo ""
echo "----------------------------------------"
echo "content apply / re-apply 0 changes / export"
echo "----------------------------------------"
BUNDLE="$TEST_DIR/bundle-2c.json"
cat > "$BUNDLE" <<'JSON'
{
  "difficultyProfiles": [
    {
      "key": "story",
      "name": "Story",
      "heroHpMultiplier": 1.5,
      "playbackSpeed": 0.85,
      "attackWeightScale": 0.75,
      "hintCharges": 3
    }
  ],
  "encounters": [
    {
      "key": "enc-pad",
      "stageId": "@stage-gate",
      "name": "Pad fight",
      "typeId": "battle",
      "moduleId": "pad",
      "tuningProfileId": "Pad Tune",
      "enemies": [{ "enemyId": "@scout-en", "attackTableId": "@pad-table" }],
      "difficultyProfileId": "@story",
      "stars": [{ "id": "s1", "label": "Win", "kind": "win" }]
    }
  ]
}
JSON
BEFORE=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-2c-apply-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "apply --dry-run wrote studio.json"
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-2c-apply.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-2c-apply.json"))
print("apply creates", len(r["creates"]), "updates", len(r["updates"]), "unchanged", len(r["unchanged"]))
PY
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-2c-re.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-2c-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-2c-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
assert len(content["difficultyProfiles"]) >= 1, content["difficultyProfiles"]
enc = next(e for e in content["encounters"] if e.get("key") == "enc-pad")
assert enc.get("enemies"), enc
assert enc["enemies"][0]["enemyId"]
print("export difficultyProfiles + encounter enemies, schema 1")
PY
$CLI difficulty list --game game-b >/tmp/forge-2c-b.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-2c-b.json"))["difficultyProfiles"]
assert rows == [], rows
print("game-b empty")
PY
pass "apply idempotent, export arrays, game isolation"

echo ""
echo "----------------------------------------"
echo "Unknown fields kept"
echo "----------------------------------------"
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
studio["assetPipeline"]["difficultyProfiles"][0]["futureFlag"] = "keep-me"
json.dump(studio, open(path, "w"), indent=2)
PY
$CLI difficulty update @story --game game-a --name Story >/tmp/forge-2c-ov.json
python3 - <<'PY'
import json, os
studio = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")))
p = studio["assetPipeline"]["difficultyProfiles"][0]
assert p["futureFlag"] == "keep-me", p
assert studio["extraStudioFlag"] is True
for name in ("worlds", "stages", "encounters", "regions", "enemies", "attackTables", "difficultyProfiles"):
    assert isinstance(studio["assetPipeline"][name], list), name
print("overlay + arrays kept")
PY
pass "unknown fields and arrays kept"

echo ""
echo -e "${GREEN}✓ 2c encounter + difficulty tests passed${NC}"
