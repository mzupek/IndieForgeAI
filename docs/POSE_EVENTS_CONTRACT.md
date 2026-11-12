# Pose Events & Stateful Assets — Implementation Contract

**Status:** P0 Contract (Schema Locked, No Runtime Yet)  
**Branch:** cursor/phase-c-scenes-spine-ac38  
**PR:** #11  
**Approved:** Matt 2026-11-06

---

## Overview

This contract defines the schema, event semantics, validation rules, and CLI surface for the Pose Events & Stateful Assets system. All data is **game-scoped** (not workspace/project), with **CLI-first** CRUD commands sharing validation with UI.

**Key Principles:**
- ✅ Reusable asset definitions distinct from scene instances
- ✅ Isolated preview state (two instances of same asset independent)
- ✅ Event bindings trigger pose/state/visibility changes
- ✅ Stable IDs with cross-game reference validation
- ✅ Engine-neutral export, runtime adapters separate
- ✅ Backwards compatible, no destructive migrations
- ✅ Deterministic scrub/reset/loop behavior

---

## Phase Roadmap

### P0: Contract & Schema (This Document)
- ✅ Lock schema additions to `assetPipeline.ts`
- ✅ Define event semantics and preview state model
- ✅ Define CLI command surface
- ✅ Define validation rules
- ✅ **No runtime behavior changes**

### P1: Generic Visual Assets + States CRUD
- Add `VisualAsset` type and storage
- CLI commands: `forge asset create/list/show/update/delete`
- CLI commands: `forge asset-state create/list/show/update/delete`
- UI: Asset library panel (logos, symbols, items, weapons)
- UI: State management in asset editor
- **Test:** CLI CRUD roundtrip, game isolation

### P2: Layer Asset Linkage + Editable Text
- Extend `StoryboardLayer` with `assetId`, `assetStateId`, `textContent`
- Add `EditableText` type and storage
- CLI commands: `forge text create/list/show/update/delete`
- UI: Layer can reference asset + select state
- UI: Editable text layer with font/palette linkage
- **Test:** Asset swapping, text updates, default state persistence

### P3: Event Bindings + Simulated Preview
- Add `EventDefinition`, `EventBinding` types
- CLI commands: `forge event create/list/show/update/delete`
- CLI commands: `forge binding create/list/show/update/delete`
- UI: Event timeline markers
- UI: Simulated event triggering (Forge only, no engine)
- **Test:** Event → action → layer state change, timer cancellation

### P4: Timed Pose/State Keyframes (implemented on the layer, not C.3c FX)
- ONE shot layer changes pose/state via `layer.timedKeys` (step/hold). Do **not** duplicate layers.
- Authored starting `poseId` / `assetStateId` stay separate from timed samples and event preview.
- Precedence: active event hold → timed sample at playhead → authored default.
- When an event ends, resolve the **current** timeline sample (not a stale sample from fire time).
- CLI: `forge layer key add|list|show|update|remove|sample` (reuses the layer command path).
- Pending C.3c per-layer FX keys are **not** part of P4.

### P5: Versioned Manifests + CLI Validate/Migrate
- Add schema version to all new types
- CLI commands: `forge validate`, `forge migrate`
- Cross-game reference validation
- Missing asset/state/event clear errors
- **Test:** Validate detects broken refs, migrate preserves data

### P6: Production Verification
- Full restart/export roundtrip
- Game isolation (multi-game workspace)
- Repeated event timer cancellation
- Independent asset instances
- Real production content stress test

---

## Schema Additions

### 1. Generic Visual Assets

**Purpose:** Logos, symbols, items, weapons — static or with named states.

```typescript
/**
 * Visual asset - generic reusable art asset with optional states
 * Distinct from character poses (which remain import-only 1024 PNGs)
 */
export interface VisualAsset {
  id: string
  gameId: string
  name: string
  /** Asset category: 'logo' | 'symbol' | 'item' | 'weapon' | 'prop' */
  category: string
  /** Tags for library search */
  tags: string[]
  /** Default state (null if single-state asset) */
  defaultStateId: string | null
  /** Thumbnail for library preview */
  thumbnail?: string
  createdAt: string
  updatedAt: string
}

/**
 * Asset state - named variation of a visual asset
 * Examples: crate "open" / "closed", weapon "ready" / "firing"
 */
export interface AssetState {
  id: string
  assetId: string
  name: string
  /** Path to image file (PNG with transparency) */
  file: string
  /** Optional bounding box override */
  boundingBox?: { width: number; height: number }
  createdAt: string
  updatedAt: string
}
```

**Storage:**
- Assets live in `assetPipeline.visualAssets[]`
- States live in `assetPipeline.assetStates[]`
- Files stored in `<dataDir>/assets/<assetId>/state_<stateId>.png`

**Validation:**
- `assetId` must reference existing `VisualAsset`
- If asset has states, `defaultStateId` must reference existing `AssetState`
- Each `AssetState.assetId` must reference existing asset
- No orphaned states (asset deleted → cascade delete states)

---

### 2. Editable Text Assets

**Purpose:** Text content with font/palette linkage, separate from baked art.

```typescript
/**
 * Editable text - text content with styling metadata
 * Font/palette references, not baked into images
 */
export interface EditableText {
  id: string
  gameId: string
  name: string
  /** Default text content */
  defaultContent: string
  /** Font reference (path or font family name) */
  font: string
  /** Font size in px */
  fontSize: number
  /** Color (hex or palette reference) */
  color: string
  /** Text alignment: 'left' | 'center' | 'right' */
  alignment: 'left' | 'center' | 'right'
  /** Optional max width for wrapping */
  maxWidth?: number
  /** Tags for library search */
  tags: string[]
  createdAt: string
  updatedAt: string
}
```

**Storage:**
- Text assets live in `assetPipeline.editableTexts[]`

**Validation:**
- `font` must be valid font family or path to font file
- `fontSize` must be positive integer
- `color` must be valid hex or palette reference

---

### 3. Event Definitions

**Purpose:** Named gameplay events that trigger actions (Unity/Godot detect, Forge simulates).

```typescript
/**
 * Event definition - named gameplay event
 * Engine runtime detects and sends; Forge simulates for preview
 */
export interface EventDefinition {
  id: string
  gameId: string
  name: string
  description?: string
  /** Optional payload schema (JSON schema subset) */
  payloadSchema?: {
    type: 'object'
    properties: Record<string, { type: string; description?: string }>
  }
  /** Tags for organization */
  tags: string[]
  createdAt: string
  updatedAt: string
}
```

**Examples:**
- `hit_received` — character takes damage
- `hit_landed` — character deals damage
- `item_collected` — player picks up item
- `door_opened` — interaction complete
- `wave_completed` — gameplay milestone

**Storage:**
- Events live in `assetPipeline.eventDefinitions[]`

**Validation:**
- Event names must be unique within game
- Payload schema must be valid JSON schema subset

---

### 4. Event Bindings

**Purpose:** Link event → target layer → action (pose/state/visibility change).

```typescript
/**
 * Event binding - links event to layer action
 * Bindings are authored per-shot, not global
 */
export interface EventBinding {
  id: string
  shotId: string
  /** Source event ID */
  eventId: string
  /** Target layer ID in this shot */
  targetLayerId: string
  /** Action type */
  action: {
    type: 'setPose' | 'setState' | 'setVisibility' | 'setText'
    /** Pose ID (for setPose) */
    poseId?: string
    /** Asset state ID (for setState) */
    stateId?: string
    /** Visibility boolean (for setVisibility) */
    visible?: boolean
    /** Text content (for setText) */
    text?: string
  }
  /** Optional payload filter (primitive equality only) */
  payloadFilter?: Record<string, string | number | boolean>
  /** Duration in seconds (0 = instant, >0 = hold then return) */
  durationSec: number
  /** Return policy after duration: 'default' | 'hold' */
  returnPolicy: 'default' | 'hold'
  createdAt: string
  updatedAt: string
}
```

**Semantics:**
- **Instant (durationSec = 0):** Apply action immediately, no timer
- **Timed (durationSec > 0):** Apply action, start timer, return based on policy
  - `returnPolicy: 'default'` → return to authored default or timed keyframe
  - `returnPolicy: 'hold'` → stay in new state indefinitely
- **Repeated event:** Cancel old timer, restart with new duration
- **Payload filter:** Only trigger if event payload matches filter (optional)

**Storage:**
- Bindings live in `assetPipeline.eventBindings[]`
- Scoped to shot (not global)

**Validation:**
- `eventId` must reference existing `EventDefinition`
- `targetLayerId` must reference layer in `shotId`
- `action.type` must match layer content type:
  - `setPose` requires layer with `characterId` + `poseId`
  - `setState` requires layer with `assetId`
  - `setVisibility` works on any layer
  - `setText` requires layer with `textId`
- `durationSec` must be >= 0
- If `payloadFilter` set, event must have matching payload schema

---

### 5. Extended StoryboardLayer

**Additions to support asset linkage and text:**

```typescript
export interface StoryboardLayer {
  // ... existing fields (id, zOrder, characterId, poseId, etc.)
  
  /** NEW: Generic visual asset reference */
  assetId?: string
  /** NEW: Current asset state (for multi-state assets) */
  assetStateId?: string
  
  /** NEW: Editable text reference */
  textId?: string
  /** NEW: Current text content override (preview only, not persisted as default) */
  textContentOverride?: string
  
  /** NEW: Visibility toggle (default true) */
  visible?: boolean
}
```

**Mutual Exclusivity:**
- A layer can have ONE of: `characterId`, `assetId`, `textId`, `clipId`, `imagePath`
- If `characterId` set → must have `poseId`
- If `assetId` set → optionally has `assetStateId` (defaults to asset's `defaultStateId`)
- If `textId` set → render text with `EditableText` styling

**Validation:**
- `assetId` must reference existing `VisualAsset`
- `assetStateId` must reference existing `AssetState` with matching `assetId`
- `textId` must reference existing `EditableText`
- Preview overrides (`textContentOverride`) never written to authored defaults

---

## Preview State Model

**Key Distinction:**
- **Authored defaults:** Persisted in `StoryboardLayer` (what's saved to disk)
- **Runtime preview state:** Transient state during playback/scrubbing (never persisted)

**Property Precedence (highest to lowest):**
1. **Active event hold:** Event binding with active timer overrides everything
2. **Timed keyframe sample:** Phase C.3c per-layer FX keyframe at current time
3. **Authored default:** Persisted layer state from `StoryboardLayer`

**Scrub/Reset Behavior:**
- **Scrub forward/backward:** Apply timed keyframes, ignore event timers (events don't auto-fire during scrub)
- **Reset (playback stop):** Clear all event timers, return all layers to authored defaults
- **Loop playback:** At loop boundary, reset event timers (start fresh each loop)

**Event Timer Semantics:**
- **Event fires:** Start timer with `durationSec`
- **Timer expires:** Apply `returnPolicy`
  - `'default'`: Return to timed keyframe at current time, or authored default if no keyframe
  - `'hold'`: Stay in new state (don't return)
- **Repeated event:** Cancel existing timer, start new timer (restart behavior)

**No Hidden Modifications:**
- Preview state changes NEVER auto-write to `StoryboardLayer` defaults
- User must explicitly "Set as Default" to persist preview state

---

## CLI Command Surface

**Pattern:** All commands follow existing pattern (see `character.ts`):
- `--game <gameId>` required for all commands (game-scoped data)
- `--json` flag for machine-readable output
- `--data-dir <path>` optional override
- CRUD operations: `create`, `list`, `show <id>`, `update <id>`, `delete <id>`

---

### Visual Assets

```bash
# Create generic visual asset
forge asset create \
  --game <gameId> \
  --name "Health Potion" \
  --category "item" \
  --tags "collectible,consumable" \
  [--json]

# List assets for game
forge asset list --game <gameId> [--category <cat>] [--json]

# Show asset details
forge asset show <assetId> --game <gameId> [--json]

# Update asset metadata
forge asset update <assetId> \
  --game <gameId> \
  [--name "..."] \
  [--category "..."] \
  [--tags "..."] \
  [--json]

# Delete asset (cascades to states and layer references)
forge asset delete <assetId> --game <gameId> [--json]
```

---

### Asset States

```bash
# Create asset state with image
forge asset-state create \
  --game <gameId> \
  --asset <assetId> \
  --name "open" \
  --file "./assets/crate_open.png" \
  [--json]

# List states for asset
forge asset-state list --game <gameId> --asset <assetId> [--json]

# Show state details
forge asset-state show <stateId> --game <gameId> [--json]

# Update state (replace image or rename)
forge asset-state update <stateId> \
  --game <gameId> \
  [--name "..."] \
  [--file "./new_image.png"] \
  [--json]

# Delete state
forge asset-state delete <stateId> --game <gameId> [--json]

# Set default state for asset
forge asset set-default-state <assetId> --state <stateId> --game <gameId>
```

---

### Editable Text

```bash
# Create text asset
forge text create \
  --game <gameId> \
  --name "Player Name" \
  --content "Hero" \
  --font "Arial" \
  --size 24 \
  --color "#FFFFFF" \
  --align "center" \
  [--max-width 200] \
  [--tags "ui,hud"] \
  [--json]

# List text assets for game
forge text list --game <gameId> [--json]

# Show text details
forge text show <textId> --game <gameId> [--json]

# Update text properties
forge text update <textId> \
  --game <gameId> \
  [--name "..."] \
  [--content "..."] \
  [--font "..."] \
  [--size <px>] \
  [--color <hex>] \
  [--align left|center|right] \
  [--json]

# Delete text asset
forge text delete <textId> --game <gameId> [--json]
```

---

### Event Definitions

```bash
# Create event
forge event create \
  --game <gameId> \
  --name "hit_received" \
  --description "Character takes damage" \
  [--payload '{"damage":{"type":"number"}}'] \
  [--tags "combat,damage"] \
  [--json]

# List events for game
forge event list --game <gameId> [--json]

# Show event details
forge event show <eventId> --game <gameId> [--json]

# Update event
forge event update <eventId> \
  --game <gameId> \
  [--name "..."] \
  [--description "..."] \
  [--payload '...'] \
  [--json]

# Delete event
forge event delete <eventId> --game <gameId> [--json]
```

---

### Event Bindings

```bash
# Create binding: event → layer → action
forge binding create \
  --game <gameId> \
  --shot <shotId> \
  --event <eventId> \
  --layer <layerId> \
  --action "setState" \
  --state <stateId> \
  --duration 0.5 \
  --return-policy "default" \
  [--filter '{"source":"player"}'] \
  [--json]

# List bindings for shot
forge binding list --game <gameId> --shot <shotId> [--json]

# Show binding details
forge binding show <bindingId> --game <gameId> [--json]

# Update binding
forge binding update <bindingId> \
  --game <gameId> \
  [--duration <sec>] \
  [--return-policy default|hold] \
  [--json]

# Delete binding
forge binding delete <bindingId> --game <gameId> [--json]
```

---

## Validation Rules

### Cross-Reference Integrity

**On Create:**
- Validate all foreign key references exist (gameId, assetId, eventId, etc.)
- Reject creation if any reference invalid

**On Delete:**
- **Cascade deletes:**
  - Asset deleted → delete all its states
  - Asset deleted → clear `assetId` from layers (or delete layer?)
  - Event deleted → delete all bindings using that event
  - Layer deleted → delete all bindings targeting that layer
- **Warn on impact:**
  - Show count of affected records before delete
  - Require `--force` flag for destructive cascades

**On Update:**
- If changing foreign key (e.g., `assetStateId`), validate new reference exists
- If removing default state, ensure no layers depend on it

---

### Game Isolation

**Strict Scoping:**
- All queries filtered by `--game <gameId>`
- Cannot reference assets/events/bindings from other games
- Cross-game references return clear validation error:
  ```
  Error: Asset 'abc-123' belongs to game 'other-game', not 'current-game'
  ```

**Migration Safety:**
- If game renamed/deleted, orphaned records stay in database
- Validation command detects orphans:
  ```bash
  forge validate --game <gameId>
  # Output:
  # ✗ 3 orphaned assets (missing game reference)
  # ✗ 5 broken bindings (missing event/layer)
  ```

---

### Schema Versioning

**Version Tracking:**
- All new types include `schemaVersion: number`
- Current version: `1`
- Future changes bump version, trigger migration

**Migration Strategy (P5):**
- Non-destructive migrations only (add fields, rename with aliases)
- Old data readable by new code (backwards compatible)
- Migration command logs all changes:
  ```bash
  forge migrate --game <gameId> --from 1 --to 2
  # Output:
  # Migrating 12 assets from v1 to v2...
  # - Added 'category' field (default: 'prop')
  # - Renamed 'thumbPath' → 'thumbnail'
  # ✓ Migration complete (0 errors)
  ```

---

## File Storage Layout

```
<dataDir>/
  studio.json                          # Main asset pipeline data
  assets/
    <assetId>/
      state_<stateId>.png              # Asset state images
      metadata.json                    # Asset metadata (redundant with studio.json)
  characters/
    <characterId>_ref.<ext>            # Existing character refs (unchanged)
    <characterId>_thumb.png
  poses/
    <poseId>.<ext>                     # Existing 1024 PNGs (unchanged)
```

**Notes:**
- Asset files stored separately from character poses (different workflow)
- Metadata duplicated in `studio.json` for single source of truth
- Thumbnail generation same as existing character workflow

---

## Export Format (Engine-Neutral)

**JSON Manifest per Shot:**

```json
{
  "schemaVersion": 1,
  "shotId": "shot-abc-123",
  "durationSec": 5.0,
  "layers": [
    {
      "id": "layer-1",
      "zOrder": 0,
      "assetId": "crate-asset",
      "defaultStateId": "closed",
      "transform": { "x": 0.5, "y": 0.5, "scale": 1.0, ... },
      "visible": true
    },
    {
      "id": "layer-2",
      "zOrder": 1,
      "characterId": "hero",
      "poseId": "hero-ready",
      "transform": { ... }
    }
  ],
  "events": [
    {
      "id": "binding-1",
      "eventName": "hit_received",
      "targetLayerId": "layer-2",
      "action": { "type": "setPose", "poseId": "hero-hurt" },
      "durationSec": 0.5,
      "returnPolicy": "default"
    }
  ],
  "assetManifest": {
    "crate-asset": {
      "states": {
        "closed": "assets/crate_closed.png",
        "open": "assets/crate_open.png"
      }
    }
  }
}
```

**Engine Runtime Responsibilities:**
- Load assets from manifest paths
- Detect gameplay events, send to Forge event system
- Apply layer state changes based on bindings
- Handle timers and return policies

**Forge Runtime (Preview Only):**
- Simulate events via UI controls
- Apply bindings to layer state (in-memory only)
- Never write preview state to authored defaults

---

## Testing Requirements

**P1: CRUD Tests**
- ✅ Create asset → list → show → update → delete
- ✅ Create state for asset → verify file copied
- ✅ Delete asset cascades to states
- ✅ Game isolation (cannot list other game's assets)

**P2: Layer Linkage Tests**
- ✅ Layer references asset → renders correct state
- ✅ Layer references text → renders with correct font/color
- ✅ Change asset state → layer updates
- ✅ Delete asset → layer handles missing reference gracefully

**P3: Event Simulation Tests**
- ✅ Fire event → binding triggers → layer state changes
- ✅ Timed binding returns to default after duration
- ✅ Repeated event cancels old timer, restarts
- ✅ Payload filter only triggers on match

**P4: Timeline Integration Tests**
- ✅ Timed keyframe overrides authored default
- ✅ Event hold overrides timed keyframe
- ✅ Scrub ignores event timers, shows timed keyframes only
- ✅ Reset clears all event timers

**P5: Migration Tests**
- ✅ Validate detects broken references
- ✅ Migrate v1 → v2 preserves all data
- ✅ Old exports still loadable by new code

**P6: Production Tests**
- ✅ Full restart/export/reimport roundtrip
- ✅ Multi-game workspace isolation
- ✅ 100+ assets with 10+ states each (stress)
- ✅ Real content from production scene

**Build-Green Is NOT Sufficient:**
- TypeScript compilation alone does NOT verify UI behavior
- All UI changes require Mac testing with real content
- Export manifests require engine integration testing

---

## Out of Scope (MVP)

**Not Implementing:**
- ❌ Sockets / follow-parent equipment attachment
- ❌ Physics simulation
- ❌ Inventory / stats system
- ❌ Visual scripting graph
- ❌ Rigging or procedural pose generation
- ❌ Auto-layout or intelligent asset placement
- ❌ Phase C.3c per-layer FX (parallel workstream, not silently included)

**Deferred to Post-MVP:**
- Advanced payload filtering (expressions, ranges)
- Event chaining / sequencing
- Conditional bindings (if/then logic)
- Animation curves for timed transitions

---

## UI Preservation Constraints

**Must Preserve (Matt: "perfect"):**
- ✅ Tabbed sidebar: Background/Layers + Camera&Effects
- ✅ Shot-wide timeline
- ✅ Shake canvas draw ordering
- ✅ Store setter object contract (not functional updater)
- ✅ Key drag/select/Delete inspector buttons

**New UI Requirements:**
- Preview controls in stable sidebar (no new central jumping panels)
- Asset library panel (similar to character library)
- Event timeline markers (distinct from camera/effect markers)
- Simulate event button (Forge only, not engine)

---

## Decision Points for Matt

**None Required at P0 — Contract Approved**

The following will need clarification in P1+:

1. **Layer deletion vs. clearing on asset delete:**
   - Option A: Delete layer if asset deleted (clean but destructive)
   - Option B: Keep layer, clear assetId (preserves transform but orphans layer)
   - **Recommendation:** Option B (safer), with validate warning

2. **Text rendering in Forge preview:**
   - Option A: Canvas 2D text rendering (immediate, limited styling)
   - Option B: Render text to image on demand (higher quality, slower)
   - **Recommendation:** Option A for MVP, Option B for production

3. **Event simulation UI placement:**
   - Option A: Separate "Events" sidebar tab
   - Option B: Inline buttons below timeline
   - **Recommendation:** Option A (cleaner, matches Camera&Effects pattern)

---

## Next Steps

### P0 Complete (This Document)
- ✅ Schema locked in contract
- ✅ CLI surface defined
- ✅ Validation rules specified
- ✅ Preview semantics documented

### P1 Ready to Begin
**Scope:** Generic Visual Assets + States CRUD

**Implementation Tasks:**
1. Add `VisualAsset` and `AssetState` types to `assetPipeline.ts`
2. Create CLI commands in `src/cli/commands/asset.ts`
3. Add storage methods in `studioStorage.ts`
4. Build UI: Asset library panel
5. Build UI: State management in asset editor
6. Write integration tests
7. Test on Mac with real content

**Deliverables:**
- ✅ CLI can create/list/show/update/delete assets and states
- ✅ UI can browse asset library, select states
- ✅ Files stored in `<dataDir>/assets/<assetId>/`
- ✅ Game isolation verified
- ✅ Validation catches broken references

**Time Estimate:** Not provided (Matt's instruction: no calendar timelines)

---

## Signatures

**Contract Author:** Cursor Agent (bc-e82ecac6-176c-5d14-a33b-bf598722834c)  
**Approved By:** Matt (2026-11-06)  
**Locked:** Schema, CLI surface, validation rules, preview semantics  
**Runtime:** Not implemented until P1+

