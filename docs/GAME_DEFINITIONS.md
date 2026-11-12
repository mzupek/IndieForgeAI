# Game Definitions — Phase B

## Overview

Game Definitions are structured, living design documents that capture the complete current state of a game in development. They combine:

- **Structured data** (JSON in the studio store) — source of truth owned by the app
- **Markdown face** — human-editable, shareable bible format
- **Resource tags** — link to real studio assets (Characters, Poses, Clips, Presets)

## Data Model

A Game Definition includes:

### Core Fields
- **Stage**: MVP | Beta | Testing | Release
- **Pillars**: Core design principles (list of strings)
- **Puzzle Core**: Gameplay loop and mechanics description
- **Story Synopsis**: Brief story overview
- **Cast**: Linked character IDs from the studio

### Linked Assets
- **Poses**: IDs of character poses used in the game
- **Clips**: IDs of video clips (intro, hit, finisher, defeat, story beats)
- **Presets**: IDs of scene/camera presets (versus, zoom_punch, shake, flash, freeze)

### Design Sections
- **Theme Slots**: UI/visual customization slots (splash, home, HUD, buttons, fonts, palette)
- **Interactions**: Gameplay mechanic stubs with linked asset references
- **Tuning Profiles**: Balance/difficulty parameters with notes

### Keep/Cut/Invent
- **Keep**: Features/patterns to preserve
- **Cut**: Items deferred from MVP scope
- **Invent**: New items needed as MVP glue (not greenfield content)

### MVP Board
Tracking table with columns:
- **Item**: Description
- **Type**: asset | system | content | tuning
- **Status**: needed | partial | done | cut
- **Notes**: Optional context

### Markdown Source
The human-facing bible, editable in the Markdown Editor tab. Can include resource tags.

## Resource Tag Syntax

Game Definitions support a durable, agent-parseable tag format for linking to studio assets:

```
[[type:id|label]]
```

### Examples

- Character: `[[character:974cc4f0-643d-4b5a-a6c5-b7f5e0bb2762|Hero]]`
- Pose: `[[pose:abc-123-xyz|Hero Ready]]`
- Clip: `[[clip:ef59207f-d87d-463b-abcb-7276bb7f9599|Gate Drone Hit]]`
- Preset: `[[preset:zoom-punch-001|Zoom Punch 1.15x]]`

### Supported Types

- `character` — Studio character entity
- `pose` — Character pose (ready, success, hurt, win, defeat)
- `clip` — Video clip (intro, hit, finisher, defeat, story_beat)
- `preset` — Scene/camera preset (versus, zoom_punch, shake, flash, freeze)
- `game` — Reference to another game

### How It Works

1. **Structured Tab**: Select cast members and linked assets via checkboxes/forms
2. **Markdown Editor**: 
   - Write or edit the markdown bible
   - Use the sidebar to insert resource tags with one click
   - Tags resolve to real studio IDs, not free-text paths
3. **Export**: Download the markdown for sharing or version control

### Agent Integration

The resource tag format is designed for engineering agents to:
- Parse the markdown and resolve asset IDs
- Fetch actual asset metadata (file paths, dimensions, status)
- Generate export manifests or Unity/Godot import scripts
- Re-read updated definitions after human edits

## Seeding

### Neon Recall
The first Game Definition for `game-neon-recall` auto-seeds from `seed/neon_recall_current_state.md` when first accessed. This captures the verified state from Matt's Unity project as of 2026-11-04.

### Other Games
Start with an empty template. Fill in pillars, puzzle core, story synopsis, cast, and MVP board manually or import from existing docs.

## Persistence

Game Definitions live in `studio.json` under `assetPipeline.gameDefinitions[]`. Each definition:
- Has a unique `id` (UUID)
- Links to a `gameId` (e.g., `game-neon-recall`)
- Stores structured fields + full markdown source
- Tracks `createdAt` and `updatedAt` timestamps

## UI Access

Navigate to **Game Definitions** in the studio sidebar, then select a game. Two tabs:

1. **Structured**: Forms and tables for all structured fields
2. **Markdown Editor**: Full markdown bible with resource tag insertion sidebar

Save structured changes auto-saves. Markdown must be explicitly saved via the "Save Markdown" button.

## CLI

`forge definition` (alias `forge gamedef`) reads and updates Game Definitions through the same service, lock, and validation as the UI. See **CLI.md → Game Definition** for the command list, JSON merge-patch rules, and a docs-only Gate Drone 3-lock pad example (do not write that example into live Neon Recall data).

`forge definition export --format json|md` is the studio-local export. A later **A4 portable export** should include the Game Definition JSON/Markdown in the shipped package; that is not implemented here.

## Phase Dependencies

- **Phase A** (Characters/Poses/Clips/Presets): Definitions link to these assets
- **Phase 4.5** (Storyboards): Parallel; definitions do not depend on storyboards
- **Phase C** (Scenes spine): ✓ Implemented; scenes are narrative moments with attached storyboards and presets
- **Phase D** (MVP board as separate product): Definitions include an embedded MVP board
- **Phase E** (Full CLI package): Builds on Phase B definitions

## Phase C — Scenes as the Spine

**Scenes** provide the organizational spine for game content. Each scene represents a narrative or gameplay moment and owns:

- **Name** and **Description**
- **Background** (description or reference)
- **Cast** (character IDs participating in this scene)
- **Story/Dialogue Text** (key narrative content)
- **Pose/Clip/Audio Refs** (linked assets for quick lookup)
- **Interaction Hooks** (gameplay mechanic stubs)
- **Attached Presets** (FX recipes: shake, flash, freeze, zoom_punch, versus)
- **Storyboard** (optional attached shot-by-shot animatic)

### Storyboard Attachment

Previously storyboards were free-floating. In Phase C, storyboards attach to scenes via `sceneId`. This ensures:
- Storyboards have narrative context
- Scenes can have a visual planning layer
- Export/CLI tools can package scene + storyboard together

### UI Access

Navigate to **Scenes** in the studio sidebar, then select a game. You can:
- Create/edit/delete scenes
- Add characters to the cast
- Attach FX presets
- Create or open the attached storyboard

Storyboards opened from a scene show "Attached to Scene: [Scene Name]" in the sidebar.

### FX Recipes (Behind-the-Scenes Library)

Scene presets (camera/FX) are lightweight, reusable effect recipes managed behind the scenes. There is no separate "FX Presets" tab in the UI. Instead:
- Create/edit FX recipes from the **Storyboard** timeline effect markers
- Reference recipes from **Scenes** via attachedPresets
- Effect markers on the timeline can use existing recipes or create quick ones (shake, flash, freeze, zoom_punch, versus)
- Click an effect marker to inspect/edit its params in-context

This keeps storyboards as the primary place for juice (effects in narrative context), not a standalone presets editor.

## No Cold Lock

Per Matt's approval on 2026-11-04, Phase A keep/cut/invent is **not locked cold**. Definitions are editable, and humans can revise scope/content as needed. Engineering agents re-read definitions on each run.
