# World 1 Intro content bundle (example seed only)

This is **data**, not app code. Apply it on top of `docs/samples/gate-drone-content.json` in a scratch `FORGE_DATA_DIR`. Do not treat mentor / hoverboard names as hardcoded in Forge. Progress is flags earned through play — there is no item record yet (Step 5).

## What it models

1. Intro stage, Yard region, mentor NPC. Talking to the mentor plays a dialogue that sets `has_hoverboard`.
2. A hoverboard test encounter on placeholder module `hover_test` (param specs on the module). The hotspot trigger only fires when `has_hoverboard` is true. Winning sets `hoverboard_test_passed`.
3. The existing Gate stage unlocks when `hoverboard_test_passed` is true (and Intro is cleared), then the existing Gate Drone encounter.

## Prepare

Same assets as the Gate Drone sample (region background name `Gate approach`, world map `World 1 map`), plus:

```bash
# Portrait-only mentor (core five not required):
forge character create --game <id> --name Mentor --role npc --json
# Use the character id from create:
forge character slots core-required <character-id> --game <id> --value false --json

# Placeholder mini-game module + a required lanes param:
forge game module add --game <id> --id hover_test --label "Hover test" --type-ids minigame --json
forge game module param add hover_test --game <id> --key lanes --type int --min 1 --max 4 --default 2 --required --json
```

Apply Gate Drone first if that world is not already in the studio:

```bash
forge content apply --game <id> --file docs/samples/gate-drone-content.json --json
```

## Apply this bundle

```bash
forge content apply --game <id> --file docs/samples/world1-intro-content.json --dry-run --json
forge content apply --game <id> --file docs/samples/world1-intro-content.json --json
# Re-apply reports 0 changes.

forge dialogue play @dlg-mentor-board --game <id> --choices 1 --json
# Sets has_hoverboard.

forge flow simulate --game <id> --world @world-1 --flags has_hoverboard=true,hoverboard_test_passed=true --json
# Intro + Gate unlocked; mentor talk and hover test triggers listed.
```

`characterId: "Mentor"` is looked up by name in this game. `@key` aliases cover stages, regions, flags, NPCs, dialogues, encounters, and triggers.
