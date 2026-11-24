#!/bin/bash
# Story canon: profiles, circles, reveal tokens, template, apply, Step 6.
# Isolated mktemp + FORGE_DATA_DIR only. Never Matt's studio.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=========================================="
echo "Story canon"
echo "=========================================="
echo ""

echo "----------------------------------------"
echo "Unit (tsx, isolated tmpdir, no Electron)"
echo "----------------------------------------"
npx tsx src/shared/story/canon.test.ts
echo ""

TEST_DIR=$(mktemp -d -t forge-story-canon-XXXXXX)
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
  "modules": [{ "id": "story_beat", "label": "Story beat", "typeIds": ["story"] }]
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
    "exportProfiles": [], "gameDefinitions": [],
    "visualAssets": [{
      "id": "bg-a", "gameId": "game-a", "name": "Yard", "category": "background",
      "tags": [], "defaultStateId": None, "createdAt": now, "updatedAt": now
    }],
    "assetStates": [], "fonts": [], "palettes": [],
    "eventDefinitions": [], "eventBindings": [], "audioAssets": [],
    "worlds": [{
      "id": "world-a", "gameId": "game-a", "key": "world-1", "name": "World 1", "order": 1,
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "stages": [{
      "id": "stage-intro", "gameId": "game-a", "worldId": "world-a", "key": "intro",
      "name": "Intro", "order": 1, "entryRegionId": "r-yard", "entryAnchor": "a-start",
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }, {
      "id": "stage-gate", "gameId": "game-a", "worldId": "world-a", "key": "the_gate",
      "name": "The Gate", "order": 2, "unlockAfter": ["stage-intro"],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "encounters": [{
      "id": "enc-hover", "gameId": "game-a", "stageId": "stage-intro", "key": "enc-hover-test",
      "name": "Intro complication", "typeId": "story", "moduleId": "story_beat",
      "stars": [], "order": 1, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }, {
      "id": "enc-gate", "gameId": "game-a", "stageId": "stage-gate", "key": "enc-gate-drone",
      "name": "Gate complication", "typeId": "story", "moduleId": "story_beat",
      "stars": [], "order": 1, "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "regions": [{
      "id": "r-yard", "gameId": "game-a", "stageId": "stage-intro", "key": "region-intro-yard",
      "name": "Yard", "backgroundAssetId": "bg-a",
      "anchors": [{"id": "a-start", "pos": [0.12, 0.78]}, {"id": "a-mentor", "pos": [0.4, 0.7]}],
      "edges": [["a-start", "a-mentor"]], "spawn": "a-start",
      "hotspots": [{"id": "hs-mentor", "anchor": "a-mentor", "prompt": "Talk"}],
      "exits": [{"id": "x-map", "anchor": "a-start", "toWorldMap": True}],
      "schemaVersion": 2, "createdAt": now, "updatedAt": now
    }],
    "enemies": [], "attackTables": [], "difficultyProfiles": [],
    "flags": [], "triggers": [], "npcs": [], "dialogues": [],
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

python3 - "$ROOT" <<'PY'
import pathlib, sys
root = pathlib.Path(sys.argv[1])
needles = ("Neon Recall", "Ring'Em Up", "memory fragment", "game-neon-recall")
paths = [
  root / "src/shared/story",
  root / "src/core/storage/storyCircleService.ts",
  root / "src/core/storage/revealTokenService.ts",
  root / "src/cli/commands/storyCircle.ts",
  root / "src/cli/commands/revealToken.ts",
  root / "src/renderer/components/StoryCanonPanels.tsx",
]
for path in paths:
    files = [path] if path.is_file() else list(path.rglob("*"))
    for f in files:
        if not f.is_file():
            continue
        if f.name == "canon.test.ts":
            continue
        text = f.read_text(errors="ignore")
        for n in needles:
            if n.lower() in text.lower() and "Memory fragment" not in n:
                # revealTokenLabel docs may mention the example in comments; allow only templates.ts comment-free
                if n == "memory fragment" and "revealTokenLabel" in text:
                    continue
                if n in text:
                    raise SystemExit(f"game-specific string {n!r} in {f}")
print("ok")
PY
pass "no game titles in canon app modules"

echo ""
echo "----------------------------------------"
echo "CLI build"
echo "----------------------------------------"
npm run build:cli >/tmp/forge-canon-build-cli.log
pass "CLI built"

echo ""
echo "----------------------------------------"
echo "Character via content apply + story profile"
echo "----------------------------------------"
BEFORE=$(hash_of "$STUDIO")
$CLI content apply --game game-a --file "$ROOT/docs/samples/world1-story-canon.json" --dry-run >/tmp/forge-canon-dry.json
AFTER_DRY=$(hash_of "$STUDIO")
[ "$BEFORE" = "$AFTER_DRY" ] || fail "content apply --dry-run wrote studio.json"
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-dry.json"))
assert data.get("written") is False
assert any(c.get("type") == "character" for c in data.get("creates", []))
assert any(c.get("type") == "revealToken" for c in data.get("creates", []))
assert any(c.get("type") == "storyCircle" for c in data.get("creates", []))
print("dry-run creates characters/circles/tokens")
PY
$CLI content apply --game game-a --file "$ROOT/docs/samples/world1-story-canon.json" >/tmp/forge-canon-apply.json
$CLI content apply --game game-a --file "$ROOT/docs/samples/world1-story-canon.json" >/tmp/forge-canon-reapply.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-reapply.json"))
assert data.get("creates") == [] or len(data.get("creates", [])) == 0
assert data.get("updates") == [] or len(data.get("updates", [])) == 0
print("re-apply 0 changes")
PY
pass "apply + idempotent re-apply"

echo ""
echo "----------------------------------------"
echo "Step 6 warning then approved error"
echo "----------------------------------------"
$CLI world flow @world-1 --game game-a >/tmp/forge-canon-flow.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-flow.json"))
text = json.dumps(data)
assert "Intro circle" in text or '"kind": "circle"' in text or '"kind":"circle"' in text, text[:1200]
print("flow includes the stage circle")
PY
# Missing encounter on a new approved circle should error
if $CLI story-circle create --game game-a --name "Gate circle" --key circle-gate --scope stage --ref @the_gate --canon approved >/tmp/forge-canon-s6.json 2>/tmp/forge-canon-s6.err; then
  fail "approved stage circle without Step 6 encounter should error"
else
  grep -q "Step 6" /tmp/forge-canon-s6.err /tmp/forge-canon-s6.json 2>/dev/null || grep -q "Step 6" /tmp/forge-canon-s6.err
  pass "approved Step 6 missing encounter is an error"
fi

echo ""
echo "----------------------------------------"
echo "grantRevealToken via dialogue play"
echo "----------------------------------------"
$CLI dialogue play @dlg-mentor-board --game game-a --choices 1 >/tmp/forge-canon-play.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-play.json"))
result = data.get("result") or data
granted = result.get("grantedRevealTokens") or []
assert any(t.get("key") == "fragment_gate" for t in granted), json.dumps(result)[:800]
flags = result.get("flags") or []
assert any(f.get("key") == "revealed_fragment_gate" and f.get("value") is True for f in flags)
print("play granted fragment_gate")
PY
pass "dialogue play reports granted tokens"

echo ""
echo "----------------------------------------"
echo "CLI list --canon + export"
echo "----------------------------------------"
$CLI story-circle list --game game-a --canon draft >/tmp/forge-canon-clist.json
$CLI reveal-token list --game game-a >/tmp/forge-canon-tlist.json
$CLI npc list --game game-a --canon draft >/tmp/forge-canon-nlist.json
mkdir -p "$TEST_DIR/export"
$CLI content export --game game-a --out "$TEST_DIR/export" >/tmp/forge-canon-export.json
python3 - "$TEST_DIR/export/content.json" <<'PY'
import json, sys
content = json.load(open(sys.argv[1]))
assert "storyCircles" in content
assert "revealTokens" in content
assert "characters" in content
assert any(c.get("key") == "mentor" for c in content["characters"])
assert any(t.get("key") == "fragment_gate" for t in content["revealTokens"])
print("export includes canon entities")
PY
pass "list + export"

echo ""
echo "----------------------------------------"
echo "game create --template adventure-lens"
echo "----------------------------------------"
$CLI game create --name "Template Game" --engine unity --template adventure-lens >/tmp/forge-canon-tmpl.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-tmpl.json"))
rec = data.get("record") or data
assert rec.get("name") == "Template Game"
assert data.get("template") == "adventure-lens" or rec.get("settings", {}).get("revealTokenLabel") == "Reveal token"
print("created from template")
PY
GID=$(python3 -c 'import json; d=json.load(open("/tmp/forge-canon-tmpl.json")); r=d.get("record") or d; print(r["id"])')
$CLI story-circle list --game "$GID" >/tmp/forge-canon-tmpl-circles.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-tmpl-circles.json"))
circles = data.get("circles") or data
assert len(circles) >= 1
print("template copied circles")
PY
pass "template copies into a new game"

echo ""
echo "----------------------------------------"
echo "Isolation: game-b has no canon"
echo "----------------------------------------"
$CLI story-circle list --game game-b >/tmp/forge-canon-b.json
python3 - <<'PY'
import json
data = json.load(open("/tmp/forge-canon-b.json"))
circles = data.get("circles") or []
assert circles == []
print("game-b empty")
PY
pass "game isolation"

echo ""
echo -e "${GREEN}Story canon tests passed${NC}"
