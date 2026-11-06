# P1 Implementation Brief: Generic Visual Assets + States CRUD

**Phase:** P1 (next after P0 contract approval)  
**Depends On:** P0 Contract ([POSE_EVENTS_CONTRACT.md](./POSE_EVENTS_CONTRACT.md))  
**Branch:** cursor/phase-c-scenes-spine-ac38 (continue same)  
**PR:** #11 (continue same)

---

## Scope

**Goal:** Enable CLI and UI creation/management of generic visual assets with optional multi-state support.

**Deliverables:**
1. ✅ CLI commands for assets and asset states (CRUD)
2. ✅ Storage layer integration
3. ✅ UI: Asset library panel
4. ✅ UI: State management in asset editor
5. ✅ File management (import PNGs, generate thumbnails)
6. ✅ Validation (game isolation, reference integrity)
7. ✅ Integration tests
8. ✅ Mac testing with real content

**Out of Scope:**
- ❌ Layer linkage (deferred to P2)
- ❌ Event bindings (deferred to P3)
- ❌ Timeline integration (deferred to P4)
- ❌ Editable text (deferred to P2)

---

## Implementation Plan

### Step 1: Type Integration (0.5 hrs)

**Files Modified:**
- `src/shared/types/assetPipeline.ts`

**Changes:**
1. Import `VisualAsset` and `AssetState` from `assetPipeline.events.ts`
2. Add to `AssetPipelineProject` interface:
   ```typescript
   export interface AssetPipelineProject {
     // ... existing fields
     visualAssets: VisualAsset[]
     assetStates: AssetState[]
   }
   ```

**Test:** TypeScript compiles, no runtime changes yet

---

### Step 2: Storage Layer (1 hr)

**Files Modified:**
- `src/core/storage/studioStorage.ts`

**Changes:**
1. Add `visualAssets: []` and `assetStates: []` to `createEmptyStudioData()`
2. Add helper functions:
   ```typescript
   export async function getVisualAssets(gameId: string, dataDir?: string): Promise<VisualAsset[]>
   export async function getAssetStates(assetId: string, dataDir?: string): Promise<AssetState[]>
   export async function addVisualAsset(asset: VisualAsset, dataDir?: string): Promise<void>
   export async function updateVisualAsset(asset: VisualAsset, dataDir?: string): Promise<void>
   export async function deleteVisualAsset(assetId: string, dataDir?: string): Promise<void>
   // ... similar for AssetState
   ```

**File Management:**
- Asset files stored in `<dataDir>/assets/<assetId>/state_<stateId>.png`
- Thumbnails generated via `sharp` (same as character workflow)

**Test:** Unit tests for CRUD operations, file copying

---

### Step 3: CLI Commands - Assets (1.5 hrs)

**New File:**
- `src/cli/commands/asset.ts`

**Commands:**
```bash
forge asset create --game <id> --name "..." --category "..." [--tags "..."]
forge asset list --game <id> [--category "..."] [--json]
forge asset show <assetId> --game <id> [--json]
forge asset update <assetId> --game <id> [--name "..."] [--category "..."]
forge asset delete <assetId> --game <id> [--json]
```

**Validation:**
- Game ID must exist
- Asset name required
- Category must be valid: 'logo' | 'symbol' | 'item' | 'weapon' | 'prop'

**Test:** CLI integration tests (create, list, show, update, delete roundtrip)

---

### Step 4: CLI Commands - Asset States (1.5 hrs)

**New File:**
- `src/cli/commands/asset-state.ts`

**Commands:**
```bash
forge asset-state create --game <id> --asset <assetId> --name "..." --file "./path.png"
forge asset-state list --game <id> --asset <assetId> [--json]
forge asset-state show <stateId> --game <id> [--json]
forge asset-state update <stateId> --game <id> [--name "..."] [--file "./new.png"]
forge asset-state delete <stateId> --game <id> [--json]
forge asset set-default-state <assetId> --state <stateId> --game <id>
```

**File Handling:**
- Copy PNG to `<dataDir>/assets/<assetId>/state_<stateId>.png`
- Generate thumbnail at `<dataDir>/assets/<assetId>/state_<stateId>_thumb.png`
- Validate PNG format, transparency support

**Validation:**
- Asset ID must exist
- State name required
- File must be valid PNG
- Only one state can be default per asset

**Test:** CLI integration tests, file copying verification

---

### Step 5: CLI Integration (0.5 hrs)

**Files Modified:**
- `src/cli/forge.ts`

**Changes:**
1. Register `asset` and `asset-state` commands
2. Wire up subcommands (create, list, show, update, delete)

**Test:** `forge --help` shows new commands

---

### Step 6: UI - Asset Library Panel (3 hrs)

**New Component:**
- `src/renderer/components/AssetLibrary.tsx`

**Layout:**
```
┌─────────────────────────────────┐
│ Asset Library                   │
├─────────────────────────────────┤
│ [Filter: All ▾] [+ New Asset]  │
├─────────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐        │
│ │ Icon│ │ Icon│ │ Icon│        │
│ │Name │ │Name │ │Name │        │
│ └─────┘ └─────┘ └─────┘        │
│                                 │
│ (Grid layout, thumbnails)       │
└─────────────────────────────────┘
```

**Features:**
- Grid view with thumbnails
- Filter by category
- Click to select (highlight)
- Double-click to edit
- Right-click for context menu (rename, delete)
- Search bar

**Styling:**
- Match existing character library styling
- Use Forge design tokens

**Test:** Manual Mac testing - create/browse/select assets

---

### Step 7: UI - Asset Editor (2 hrs)

**New Component:**
- `src/renderer/components/AssetEditor.tsx`

**Layout:**
```
┌─────────────────────────────────┐
│ Edit Asset: "Health Potion"     │
├─────────────────────────────────┤
│ Name: [Health Potion         ]  │
│ Category: [item ▾]              │
│ Tags: [collectible, consumable] │
│                                 │
│ States:                         │
│ ┌─────┐ ┌─────┐                │
│ │Full │ │Empty│ [+ Add State]  │
│ │✓def │ │     │                │
│ └─────┘ └─────┘                │
│                                 │
│ [Save] [Cancel]                 │
└─────────────────────────────────┘
```

**Features:**
- Edit asset metadata (name, category, tags)
- View/manage states
- Set default state (radio button)
- Add new state (file picker for PNG)
- Delete state (confirm dialog)
- Preview state images

**Validation:**
- Name required
- Category required
- At least one state if multi-state asset
- Default state must be selected if states exist

**Test:** Manual Mac testing - edit asset, add/remove states

---

### Step 8: Asset State Upload (1 hr)

**Component:**
- `src/renderer/components/AssetStateUpload.tsx`

**Features:**
- File picker (PNG only)
- Preview uploaded image
- Name input for state
- "Set as Default" checkbox
- Upload progress indicator

**IPC Handler:**
- `indieForge.assets.uploadState(assetId, stateName, filePath, setAsDefault)`
- Copy file to `<dataDir>/assets/<assetId>/state_<stateId>.png`
- Generate thumbnail
- Update `studio.json`

**Test:** Manual Mac testing - upload PNG, verify file copied

---

### Step 9: Integration Tests (2 hrs)

**New Test File:**
- `src/cli/commands/asset.test.ts`
- `src/cli/commands/asset-state.test.ts`

**Test Cases:**
1. Create asset → verify in studio.json
2. List assets → filter by game
3. Show asset → verify details
4. Update asset → verify changes persisted
5. Delete asset → verify cascade to states
6. Create state with file → verify file copied
7. Set default state → verify updated
8. Delete state → verify file removed
9. Game isolation → cannot access other game's assets

**Run:**
```bash
npm test -- asset.test.ts
npm test -- asset-state.test.ts
```

**Test:** All tests pass

---

### Step 10: Validation & Edge Cases (1 hr)

**Scenarios:**
1. Delete asset with states → cascade delete states
2. Delete asset referenced by layer (P2) → clear layer reference or warn
3. Set default state on asset with no states → error
4. Upload non-PNG file → error
5. Create asset with duplicate name → allow (IDs are unique)
6. Cross-game asset reference → clear error message

**Implementation:**
- Add validation helpers in `assetPipeline.events.ts`
- Add error handling in CLI and UI
- Add confirmation dialogs for destructive actions

**Test:** Manual Mac testing - trigger edge cases, verify graceful handling

---

### Step 11: Mac Testing with Real Content (2 hrs)

**Test Scenarios:**

**Scenario 1: Create Multi-State Asset**
1. CLI: `forge asset create --game game-neon-recall --name "Crate" --category "prop"`
2. CLI: `forge asset-state create --game game-neon-recall --asset <assetId> --name "closed" --file "./crate_closed.png"`
3. CLI: `forge asset-state create --game game-neon-recall --asset <assetId> --name "open" --file "./crate_open.png"`
4. CLI: `forge asset set-default-state <assetId> --state <closedStateId> --game game-neon-recall`
5. UI: Open asset library, verify crate appears
6. UI: Double-click crate, verify both states visible
7. UI: Change default state to "open", save
8. CLI: `forge asset show <assetId> --game game-neon-recall --json`
9. Verify `defaultStateId` changed

**Scenario 2: Single-State Asset**
1. UI: Click "+ New Asset"
2. Enter name "Health Potion", category "item", tags "collectible"
3. Upload single PNG file
4. Save
5. CLI: `forge asset list --game game-neon-recall --json`
6. Verify asset appears with `defaultStateId: null`

**Scenario 3: Delete Asset with States**
1. CLI: `forge asset delete <crateId> --game game-neon-recall`
2. Verify prompt: "This will delete 2 states. Continue?"
3. Confirm
4. Verify asset and states removed from studio.json
5. Verify files removed from `<dataDir>/assets/<assetId>/`

**Scenario 4: Game Isolation**
1. Create asset in game A
2. Try to list assets for game B
3. Verify asset from game A not visible
4. Try to reference asset from game A in game B layer (P2)
5. Verify clear error: "Asset belongs to different game"

**Expected:**
- ✅ All CRUD operations work via CLI
- ✅ All CRUD operations work via UI
- ✅ Files copied to correct locations
- ✅ Thumbnails generated correctly
- ✅ Game isolation enforced
- ✅ Validation errors clear and helpful

---

## Files Created/Modified Summary

### New Files (9)
1. `src/shared/types/assetPipeline.events.ts` (P0, already exists)
2. `src/cli/commands/asset.ts`
3. `src/cli/commands/asset-state.ts`
4. `src/cli/commands/asset.test.ts`
5. `src/cli/commands/asset-state.test.ts`
6. `src/renderer/components/AssetLibrary.tsx`
7. `src/renderer/components/AssetEditor.tsx`
8. `src/renderer/components/AssetStateUpload.tsx`
9. `docs/P1_IMPLEMENTATION_BRIEF.md` (this file)

### Modified Files (4)
1. `src/shared/types/assetPipeline.ts` (add visualAssets, assetStates)
2. `src/core/storage/studioStorage.ts` (add asset CRUD functions)
3. `src/cli/forge.ts` (register asset commands)
4. `src/main/ipc/handlers.ts` (add asset IPC handlers)

**Total:** 13 files

---

## Commit Strategy

**Incremental Commits (Build-Green Each Step):**

1. `feat(types): Add VisualAsset and AssetState schemas (P1)`
2. `feat(storage): Add asset CRUD functions to studioStorage`
3. `feat(cli): Add forge asset commands (create/list/show/update/delete)`
4. `feat(cli): Add forge asset-state commands (create/list/show/update/delete)`
5. `feat(cli): Register asset commands in forge CLI`
6. `test(cli): Add integration tests for asset commands`
7. `feat(ui): Add AssetLibrary component`
8. `feat(ui): Add AssetEditor component with state management`
9. `feat(ui): Add AssetStateUpload component`
10. `test(integration): Add asset roundtrip tests`
11. `docs(p1): Document P1 implementation and testing results`

**Each commit:**
- ✅ Builds successfully (`npm run build`)
- ✅ Passes TypeScript checks
- ✅ Includes tests where applicable
- ✅ Includes clear commit message

---

## Risk Assessment

### Low Risk
- ✅ Schema additions (additive only, no breaking changes)
- ✅ CLI commands (follow existing patterns)
- ✅ Storage layer (similar to character/pose storage)

### Medium Risk
- ⚠️ UI integration (new components, layout changes)
- ⚠️ File management (file copying, thumbnail generation)
- ⚠️ Validation edge cases (deletion cascades, orphaned references)

### High Risk
- ❌ None identified for P1 scope

### Mitigation
- Incremental commits with build verification
- Integration tests before UI work
- Mac testing with real content before declaring done
- Clear error messages for validation failures

---

## Success Criteria

**P1 Complete When:**
1. ✅ CLI can create/list/show/update/delete assets and states
2. ✅ UI can browse asset library, create/edit assets
3. ✅ Files stored correctly in `<dataDir>/assets/`
4. ✅ Thumbnails generated for preview
5. ✅ Game isolation enforced (no cross-game refs)
6. ✅ Validation catches broken references
7. ✅ Integration tests pass
8. ✅ Mac testing with real content successful
9. ✅ All commits build-green
10. ✅ Documentation updated

**Ready for P2 When:**
- User can create and manage generic visual assets via CLI and UI
- Assets have zero, one, or multiple states
- Default state selection persisted
- Files and metadata correctly stored
- No runtime behavior changes to existing features

---

## Dependencies & Blockers

**None Identified**

P1 is fully self-contained and does not depend on:
- ❌ Phase C.3c (per-layer FX) — parallel workstream
- ❌ Layer linkage (P2) — deferred
- ❌ Event system (P3) — deferred

**Ready to Begin:** Immediately after P0 contract approval

---

## Questions for Matt (Optional)

**No blocking questions — proceed with plan as documented**

The following are clarifications that can be resolved during implementation:

1. **Asset Categories:**
   - Predefined list: 'logo' | 'symbol' | 'item' | 'weapon' | 'prop'
   - Or free-form string?
   - **Recommendation:** Predefined for MVP, free-form later

2. **Thumbnail Size:**
   - Use same 256x256 as characters?
   - Or smaller (128x128) for grid view?
   - **Recommendation:** 256x256 (consistency)

3. **Asset Library Placement:**
   - New sidebar tab "Assets"?
   - Or separate window?
   - **Recommendation:** New sidebar tab (matches pattern)

4. **State Naming:**
   - Free-form string?
   - Or predefined (idle, active, disabled)?
   - **Recommendation:** Free-form (flexibility)

These can be decided during implementation without blocking P1 start.

---

## Timeline Estimate

**NOT PROVIDED** per Matt's instruction (no calendar timelines for autonomous agents)

**Rough Effort:**
- Implementation: ~15 hours
- Testing: ~5 hours
- Mac verification: ~2 hours
- **Total:** ~22 hours of focused work

**Checkpoints:**
1. CLI working (integration tests pass)
2. UI working (can create/edit/delete via UI)
3. Mac testing complete (real content verified)

---

## Post-P1 Next Steps

**P2 Scope Preview:**
- Extend `StoryboardLayer` with `assetId`, `assetStateId`, `textId`
- Add `EditableText` type and CLI commands
- UI: Layer can reference asset + select state
- UI: Editable text layer with font/palette linkage
- **Test:** Asset swapping, text updates, default state persistence

**P2 will build directly on P1's asset infrastructure.**

---

## Approval Checkpoint

**P0 Contract Approved:** ✅ Matt 2026-11-06

**P1 Ready to Begin:** ✅ (after this brief reviewed)

**Next Action:** Implement P1 per this plan, commit incrementally, test on Mac.

