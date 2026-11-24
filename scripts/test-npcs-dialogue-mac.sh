#!/bin/bash
# Step 4 NPCs, dialogue trees, play, and World 1 Intro sample.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Step 4 NPCs and dialogue"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/story/dialogue.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-step4-npc-XXXXXX)
export FORGE_DATA_DIR="$TEST_DIR"
CLI="node out/cli/forge.js --json"
STUDIO="$TEST_DIR/studio.json"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

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
    "id": "memory_pad",
    "label": "Memory pad",
    "typeIds": ["battle"],
    "starKinds": ["win", "noMisses", "timeUnder"],
    "winConditions": ["locks"]
  }, {
    "id": "hover_test",
    "label": "Hover test",
    "typeIds": ["minigame"],
    "starKinds": ["win"],
    "paramSpecs": [{
      "key": "lanes", "type": "int", "min": 1, "max": 4, "default": 2, "required": True
    }]
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
    "characters": [
      {
        "id": "char-mentor", "gameId": "game-a", "name": "Mentor", "role": "npc",
        "tags": [], "corePosesRequired": False, "createdAt": now, "updatedAt": now
      },
      {
        "id": "char-hero", "gameId": "game-a", "name": "Hero", "role": "protagonist",
        "tags": [], "createdAt": now, "updatedAt": now
      },
      {
        "id": "char-drone", "gameId": "game-a", "name": "Gate Drone", "role": "enemy",
        "tags": [], "createdAt": now, "updatedAt": now
      }
    ],
    "poses": [],
    "clips": [], "scenePresets": [],
    "scenes": [{
      "id": "scene-a", "gameId": "game-a", "name": "Gate Drone Encounter",
      "cast": [], "poseRefs": [], "clipRefs": [], "audioRefs": [],
      "interactionHooks": [], "attachedPresets": [], "createdAt": now, "updatedAt": now
    }],
    "storyboards": [], "storyboardShots": [],
    "exportProfiles": [],
    "gameDefinitions": [{
      "id": "def-a", "gameId": "game-a", "stage": "MVP", "pillars": [], "puzzleCore": "",
      "storySynopsis": "", "cast": [], "linkedAssets": {"poses": [], "clips": [], "presets": []},
      "themeSlots": [], "interactions": [],
      "tuningProfiles": [{"id": "tune-a", "name": "Gate Drone Encounter", "params": {"hp": 20}}],
      "keepCutInvent": {"keep": [], "cut": [], "invent": []}, "mvpBoard": [], "markdownSource": "",
      "createdAt": now, "updatedAt": now
    }],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "name": "Gate approach", "category": "background",
      "tags": [], "defaultStateId": None, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }, {
      "id": "bg-map", "gameId": "game-a", "name": "World 1 map", "category": "background",
      "tags": [], "defaultStateId": None, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "assetStates": [], "fonts": [], "palettes": [],
    "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [],
    "stages": [],
    "encounters": [],
    "regions": [],
    "enemies": [{
      "id": "en-drone", "gameId": "game-a", "name": "Gate Drone", "characterId": "char-drone",
      "moduleId": "memory_pad", "winCondition": {"kind": "locks", "params": {}},
      "stats": {}, "poses": {}, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "attackTables": [], "difficultyProfiles": [],
    "flags": [], "triggers": [], "npcs": [], "dialogues": [],
    "createdAt": now, "updatedAt": now
  }
}
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
with open(path, "w") as f:
    json.dump(studio, f, indent=2)
    f.write("\n")
PY
pass "v2 two-game fixture (no title names in app ids)"

hash_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

echo ""
echo "----------------------------------------"
echo "Game-agnostic: no title-specific ids in Step 4 app modules"
echo "----------------------------------------"
if grep -RInE 'memory_pad|game-neon-recall|Gate Drone|Neon Recall|Ring.?em.?Up|ride_boost|hoverboard|has_hoverboard' \
  src/shared/story/npcs.ts \
  src/shared/story/dialogue.ts \
  src/core/storage/npcService.ts \
  src/core/storage/dialogueService.ts \
  src/cli/commands/npc.ts \
  src/cli/commands/dialogue.ts \
  src/renderer/components/NpcDialoguePanels.tsx \
  >/dev/null 2>&1; then
  fail "game-specific strings leaked into Step 4 app modules"
fi
pass "no game-specific strings in Step 4 modules"

echo ""
echo "----------------------------------------"
echo "NPC CRUD + dry-run + isolation"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI npc create --game game-a --name Mentor --key mentor --character Mentor --role mentor --dry-run >/tmp/forge-s4-npc-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "npc --dry-run wrote studio.json"
$CLI npc create --game game-a --name Mentor --key mentor --character Mentor --role mentor >/tmp/forge-s4-npc.json
$CLI npc list --game game-a >/tmp/forge-s4-nlist.json
python3 - <<'PY'
import json
npcs = json.load(open("/tmp/forge-s4-nlist.json"))["npcs"]
assert len(npcs) == 1, npcs
n = npcs[0]
assert n["displayName"] == "Mentor" and n["role"] == "mentor" and n["key"] == "mentor"
assert n["characterId"] == "char-mentor", n
print("npc created")
PY
$CLI npc update @mentor --game game-a --role guide >/tmp/forge-s4-npc-up.json
$CLI npc show @mentor --game game-a >/tmp/forge-s4-npc-show.json
python3 - <<'PY'
import json
rec = json.load(open("/tmp/forge-s4-npc-show.json"))["record"]
assert rec["role"] == "guide"
print("npc update")
PY
$CLI npc list --game game-b >/tmp/forge-s4-nlist-b.json
python3 - <<'PY'
import json
npcs = json.load(open("/tmp/forge-s4-nlist-b.json"))["npcs"]
assert npcs == [], npcs
print("game-b isolated")
PY
if $CLI npc create --game game-a --name Dup --key mentor --character Mentor --role mentor >/tmp/x.json 2>/tmp/x.err; then
  fail "duplicate npc key should fail"
fi
pass "npc CRUD, dry-run, isolation"

echo ""
echo "----------------------------------------"
echo "Dialogue CRUD + node/choice + play"
echo "----------------------------------------"
$CLI dialogue create --game game-a --name Talk --key mentor-talk --start offer \
  --nodes '[{"id":"offer","speaker":"@mentor","text":"Take it?","choices":[{"text":"Yes","next":"give"},{"text":"No","next":"bye"}]},{"id":"give","speaker":"@mentor","text":"Yours.","next":"bye"},{"id":"bye","speaker":"narrator","text":"They leave."}]' \
  >/tmp/forge-s4-dlg.json
$CLI dialogue list --game game-a >/tmp/forge-s4-dlist.json
python3 - <<'PY'
import json
rows = json.load(open("/tmp/forge-s4-dlist.json"))["dialogues"]
assert len(rows) == 1, rows
d = rows[0]
assert d["key"] == "mentor-talk" and d["startNodeId"] == "offer"
assert d["nodes"][0]["speaker"] != "@mentor", d["nodes"][0]
print("dialogue created, speaker bound")
PY
$CLI dialogue node add @mentor-talk --game game-a --id already --speaker @mentor --text "You have it" >/tmp/forge-s4-node.json
$CLI dialogue node update @mentor-talk give --game game-a --text "It is yours" >/tmp/forge-s4-node-up.json
$CLI dialogue choice update @mentor-talk offer 1 --game game-a --text Thanks >/tmp/forge-s4-ch-up.json
$CLI flag create --game game-a --name "Has board" --key has_board --type bool --default false --scope game >/tmp/forge-s4-flag.json
$CLI dialogue choice update @mentor-talk offer 1 --game game-a \
  --effects '[{"setFlag":{"flagId":"@has_board","value":true}}]' >/tmp/forge-s4-ch-fx.json
$CLI dialogue update @mentor-talk --game game-a \
  --entry-variants '[{"condition":{"flag":{"flagId":"@has_board","op":"eq","value":true}},"startNodeId":"already"}]' \
  >/tmp/forge-s4-var.json
$CLI dialogue play @mentor-talk --game game-a --choices 1 --json >/tmp/forge-s4-play.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-play.json"))["result"]
assert r["ended"] is True
assert r["startNodeId"] == "offer", r
assert r["steps"][0]["choiceText"] == "Thanks", r["steps"][0]
assert any(f["key"] == "has_board" and f["value"] is True for f in r["flags"]), r["flags"]
print("play yes")
PY
$CLI dialogue play @mentor-talk --game game-a --flags has_board=true --json >/tmp/forge-s4-play-var.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-play-var.json"))["result"]
assert r["startNodeId"] == "already", r
assert r["steps"][0]["nodeId"] == "already"
print("play entry variant")
PY
$CLI npc update @mentor --game game-a --dialogue @mentor-talk >/tmp/forge-s4-npc-dlg.json
pass "dialogue CRUD, node/choice, play"

echo ""
echo "----------------------------------------"
echo "In-use deletes + startDialogue missing is an error"
echo "----------------------------------------"
if $CLI npc remove @mentor --game game-a >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use npc should refuse remove"
fi
grep -qi "Talk" /tmp/x.err /tmp/x.json || fail "npc in-use error should name the dialogue"
if $CLI dialogue remove @mentor-talk --game game-a >/tmp/x.json 2>/tmp/x.err; then
  fail "in-use dialogue should refuse remove"
fi
grep -qi "Mentor" /tmp/x.err /tmp/x.json || fail "dialogue in-use error should name the npc"
$CLI trigger create --game game-a --name Talk --key talk --kind onHotspot --source hs-mentor \
  --effects '[{"startDialogue":{"dialogueId":"@mentor-talk"}}]' >/tmp/forge-s4-tr.json
if $CLI dialogue remove @mentor-talk --game game-a >/tmp/x.json 2>/tmp/x.err; then
  fail "dialogue used by startDialogue should refuse remove"
fi
grep -qi "Talk" /tmp/x.err /tmp/x.json || fail "dialogue in-use should name the trigger"
if $CLI trigger create --game game-a --name Ghost --key ghost-dlg --kind onHotspot --source missing \
  --effects '[{"startDialogue":{"dialogueId":"no-such-dialogue"}}]' >/tmp/x.json 2>/tmp/x.err; then
  fail "startDialogue missing dialogue should be an error"
fi
grep -qi "Dialogue" /tmp/x.err /tmp/x.json || fail "missing dialogue should be named"
$CLI npc create --game game-a --name Spare --key spare --character Mentor --role extra >/tmp/forge-s4-spare.json
$CLI npc remove @spare --game game-a >/tmp/forge-s4-spare-rm.json
pass "in-use deletes refused; unused npc removed; missing startDialogue errors"

echo ""
echo "----------------------------------------"
echo "Flow preview shows NPC placements"
echo "----------------------------------------"
# Seed a tiny world/region so flow has somewhere to hang the placement.
$CLI world create --game game-a --name "World 1" --key world-1 >/tmp/forge-s4-world.json
$CLI stage create --game game-a --world @world-1 --name Intro --key stage-intro >/tmp/forge-s4-stage.json
$CLI region create --game game-a --stage @stage-intro --name Yard --key region-intro \
  --background "Gate approach" \
  --anchors '[{"id":"a-start","pos":[0.1,0.8]},{"id":"a-mentor","pos":[0.4,0.7]}]' \
  --spawn a-start >/tmp/forge-s4-region.json
$CLI npc update @mentor --game game-a --placements '[{"regionId":"@region-intro","anchorId":"a-mentor","interactTriggerId":"@talk"}]' >/tmp/forge-s4-place.json
$CLI world flow --game game-a @world-1 >/tmp/forge-s4-flow.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-s4-flow.json")))
assert "Mentor @ a-mentor" in blob, blob
print("flow npc placement")
PY
pass "flow lists NPC placements"

echo ""
echo "----------------------------------------"
echo "content export includes npcs/dialogues; apply 0 changes"
echo "----------------------------------------"
$CLI content export --game game-a --out "$TEST_DIR/export-a" >/tmp/forge-s4-export.json
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
assert content["contentSchemaVersion"] == 1, content
assert any(n.get("key") == "mentor" for n in content["npcs"]), content["npcs"]
assert any(d.get("key") == "mentor-talk" for d in content["dialogues"]), content["dialogues"]
print("export npcs/dialogues, schema 1")
PY
BUNDLE="$TEST_DIR/bundle-s4.json"
python3 - <<'PY'
import json, os
content = json.load(open(os.path.join(os.environ["FORGE_DATA_DIR"], "export-a", "content.json")))
npc = next(n for n in content["npcs"] if n.get("key") == "mentor")
dlg = next(d for d in content["dialogues"] if d.get("key") == "mentor-talk")
bundle = {
  "npcs": [{
    "key": npc["key"],
    "displayName": npc["displayName"],
    "role": npc["role"],
    "characterId": "Mentor",
    "defaultDialogueId": "@mentor-talk",
    "placements": [{
      "regionId": "@region-intro",
      "anchorId": "a-mentor",
      "interactTriggerId": "@talk"
    }]
  }],
  "dialogues": [{
    "key": dlg["key"],
    "name": dlg["name"],
    "startNodeId": dlg["startNodeId"],
    "entryVariants": dlg.get("entryVariants") or [],
    "nodes": [
      {
        "id": n["id"],
        "speaker": "@mentor" if n["speaker"] not in ("hero", "narrator") else n["speaker"],
        "text": n["text"],
        "next": n.get("next"),
        "effects": n.get("effects"),
        "choices": n.get("choices")
      }
      for n in dlg["nodes"]
    ]
  }]
}
open(os.path.join(os.environ["FORGE_DATA_DIR"], "bundle-s4.json"), "w").write(json.dumps(bundle, indent=2) + "\n")
PY
$CLI content apply --game game-a --file "$BUNDLE" --dry-run >/tmp/forge-s4-apply-dry.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-s4-apply.json
$CLI content apply --game game-a --file "$BUNDLE" >/tmp/forge-s4-re.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("re-apply unchanged", len(r["unchanged"]))
PY
pass "export npcs/dialogues, apply idempotent"

echo ""
echo "----------------------------------------"
echo "World 1 Intro sample on top of Gate Drone sample"
echo "----------------------------------------"
# Fresh game-a world graph for the real sample files.
python3 - <<'PY'
import json, os
path = os.path.join(os.environ["FORGE_DATA_DIR"], "studio.json")
studio = json.load(open(path))
p = studio["assetPipeline"]
p["worlds"] = []
p["stages"] = []
p["encounters"] = []
p["regions"] = []
p["flags"] = []
p["triggers"] = []
p["npcs"] = []
p["dialogues"] = []
p["difficultyProfiles"] = []
open(path, "w").write(json.dumps(studio, indent=2) + "\n")
PY
GATE="$ROOT/docs/samples/gate-drone-content.json"
INTRO="$ROOT/docs/samples/world1-intro-content.json"
$CLI content apply --game game-a --file "$GATE" >/tmp/forge-s4-gate.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-gate.json"))
assert r.get("error") is not True, r
print("gate-drone apply creates", len(r["creates"]), "updates", len(r["updates"]))
PY
$CLI content apply --game game-a --file "$INTRO" --dry-run >/tmp/forge-s4-intro-dry.json
$CLI content apply --game game-a --file "$INTRO" >/tmp/forge-s4-intro.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-intro.json"))
assert r.get("error") is not True, r
types = {row["type"] for row in r["creates"] + r["updates"] + r["unchanged"]}
for need in ("flag", "npc", "dialogue", "trigger", "stage", "region", "encounter"):
    assert need in types, (need, types, r)
print("intro apply creates", len(r["creates"]), "updates", len(r["updates"]))
PY
$CLI content apply --game game-a --file "$INTRO" >/tmp/forge-s4-intro-re.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-intro-re.json"))
assert r["creates"] == [], r
assert r["updates"] == [], r
assert r["written"] is False
print("intro re-apply 0 changes")
PY
$CLI dialogue play @dlg-mentor-board --game game-a --choices 1 >/tmp/forge-s4-sample-play.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-sample-play.json"))["result"]
assert r["ended"] is True
assert any(f["key"] == "has_hoverboard" and f["value"] is True for f in r["flags"]), r["flags"]
print("sample play sets has_hoverboard")
PY
$CLI flow simulate --game game-a --world @world-1 >/tmp/forge-s4-sim-off.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-sim-off.json"))["result"]
unlocked = [s["name"] for s in r["unlockedStages"]]
locked = [s["name"] for s in r["lockedStages"]]
assert "Intro" in unlocked, r
assert "The Gate" in locked, r
names = [t["name"] for t in r["firingTriggers"]]
assert "Talk to mentor" in names, r
assert "Start hover test" not in names, r
print("gate locked; mentor talks; hover test gated")
PY
$CLI flow simulate --game game-a --world @world-1 --flags has_hoverboard=true,hoverboard_test_passed=true >/tmp/forge-s4-sim-on.json
python3 - <<'PY'
import json
r = json.load(open("/tmp/forge-s4-sim-on.json"))["result"]
unlocked = [s["name"] for s in r["unlockedStages"]]
assert "The Gate" in unlocked, r
names = [t["name"] for t in r["firingTriggers"]]
assert "Start hover test" in names, r
assert "Talk to mentor" in names, r
print("both flags: gate open, hover test fires")
PY
$CLI world flow --game game-a @world-1 >/tmp/forge-s4-sample-flow.json
python3 - <<'PY'
import json
blob = json.dumps(json.load(open("/tmp/forge-s4-sample-flow.json")))
assert "Mentor @ a-mentor" in blob, blob
assert "Talk to mentor" in blob, blob
print("sample flow shows npc + trigger")
PY
pass "World 1 Intro sample apply + simulate"

echo ""
echo -e "${GREEN}✓ Step 4 NPCs/dialogue tests passed${NC}"
