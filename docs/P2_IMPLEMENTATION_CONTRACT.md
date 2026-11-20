# P2 Implementation Contract

**Phase**: P2 - Scene/Storyboard Visual Assets & Text Integration  
**Date**: November 6, 2026  
**Status**: Contract baseline before implementation  
**Branch**: `cursor/phase-c-scenes-spine-ac38`

---

## Scope

### In Scope (P2)
1. ✅ Visual asset layer linkage (visualAssetId, assetStateId)
2. ✅ Default state semantics (layer-specific overrides)
3. ✅ Text content layers (text, fontRef, paletteRef)
4. ✅ Visibility field (hidden layers)
5. ✅ Cross-game/missing reference validation
6. ✅ In-use deletion protection (can't delete referenced assets)
7. ✅ CLI CRUD parity (`forge scene`, `forge shot`, `forge layer`)
8. ✅ Selected game dropdown scoping
9. ✅ Static image import/replace in UI (verify P1 UI gap)
10. ✅ Font/palette fallback semantics

### Out of Scope (Future)
- ❌ Runtime events (P3)
- ❌ Timeline scrubbing/animation preview (P4)
- ❌ Phase C.3c additional features

---

## Schema Additions

### 1. StoryboardLayer Extension

```typescript
export interface StoryboardLayer {
  id: string
  zOrder: number
  
  // EXISTING: Character/Pose/Clip references (preserve)
  characterId?: string
  poseId?: string
  clipId?: string
  imagePath?: string
  
  // NEW P2: Visual asset references
  visualAssetId?: string
  assetStateId?: string | null  // null = use asset's default state
  
  // NEW P2: Text content
  text?: string
  fontRef?: string    // Font ID or "default"
  paletteRef?: string // Palette ID or "default"
  
  // NEW P2: Visibility
  visible: boolean  // Default true
  
  // EXISTING: Transform (preserve)
  x: number
  y: number
  scale: number
  rotation: number
  flipX: boolean
  opacity: number
  
  // EXISTING: Effects (preserve)
  fx?: { /* ... */ }
}
```

**Semantics**:
- **Layer content priority**: Check in order: visualAssetId, characterId, poseId, clipId, imagePath, text
- **assetStateId = null**: Use asset's `defaultStateId`
- **assetStateId = undefined**: Layer has no asset (other content type)
- **visible = false**: Layer exists but hidden from render/export
- **fontRef/paletteRef = undefined**: No text content
- **Multiple instances**: Two layers can reference same asset with different states

### 2. Font & Palette Schemas (New)

```typescript
export interface Font {
  id: string
  name: string
  /** Font family name (e.g., "Arial", "Times New Roman") */
  family: string
  /** Font weight (e.g., "normal", "bold", "400", "700") */
  weight?: string
  /** Font style (e.g., "normal", "italic") */
  style?: string
  /** Source: "system" or "custom" */
  source: 'system' | 'custom'
  /** Custom font file path (if source = custom) */
  file?: string
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}

export interface Palette {
  id: string
  name: string
  /** Color definitions (hex codes) */
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  schemaVersion: 1
  createdAt: string
  updatedAt: string
}
```

### 3. AssetPipelineProject Extension

```typescript
export interface AssetPipelineProject {
  // ... existing fields ...
  visualAssets: VisualAsset[]
  assetStates: AssetState[]
  
  // NEW P2
  fonts: Font[]
  palettes: Palette[]
}
```

---

## Validation Rules

### Cross-Game References
- **Rule**: Layers can only reference assets from same `gameId`
- **Check**: `layer.visualAssetId` → `VisualAsset.gameId` must match `shot.gameId` → `scene.gameId`
- **Error**: "Layer references asset from different game"

### Missing References
- **Rule**: Referenced assets/states/fonts/palettes must exist
- **Check**: On scene save, validate all layer references resolve
- **Error**: "Layer references missing asset/state/font/palette: <id>"
- **Behavior**: Allow save with warning, mark layer as broken

### In-Use Deletion Protection
- **Rule**: Cannot delete asset/state/font/palette if referenced by any layer
- **Check**: Before delete, scan all layers for references
- **Error**: "Cannot delete <type> '<name>': referenced by <N> layer(s) in <M> scene(s)"
- **CLI**: `forge asset delete --force` to override (unsafe)

### Default State Semantics
- **Rule**: If `assetStateId = null`, resolve to asset's `defaultStateId`
- **Fallback**: If asset has no default state, render first state or placeholder
- **Instance independence**: Layer A and Layer B can reference same asset with different `assetStateId` values

---

## CLI Commands

### Scene Management
```bash
forge scene create --game <id> --name <name> [--description <desc>]
forge scene list --game <id>
forge scene show <sceneId> --game <id>
forge scene update <sceneId> --game <id> [--name <name>] [--description <desc>]
forge scene delete <sceneId> --game <id> [--force]
```

### Storyboard Shot Management
```bash
forge shot create --game <id> --name <name> --scene <sceneId> [--duration <sec>]
forge shot list --game <id> --scene <sceneId>
forge shot show <shotId> --game <id>
forge shot update <shotId> --game <id> [--name <name>] [--duration <sec>]
forge shot delete <shotId> --game <id>
```

### Layer Management
```bash
forge layer create --game <id> --shot <shotId> --type <type> [--content <id>] [--text <text>]
forge layer list --game <id> --shot <shotId>
forge layer show <layerId> --game <id>
forge layer update <layerId> --game <id> [--visible true|false] [--z-order <num>]
forge layer set-asset <layerId> --game <id> --asset <assetId> [--state <stateId>]
forge layer set-text <layerId> --game <id> --text <text> [--font <fontId>] [--palette <paletteId>]
forge layer delete <layerId> --game <id>
```

**Types**: `asset`, `character`, `pose`, `clip`, `image`, `text`

### Font & Palette Management
```bash
forge font create --name <name> --family <family> [--weight <weight>] [--style <style>]
forge font list
forge font delete <fontId> [--force]

forge palette create --name <name> --primary <hex> --secondary <hex> --accent <hex> --background <hex> --text <hex>
forge palette list
forge palette delete <paletteId> [--force]
```

---

## Storage Layer Additions

### New Methods (studioStorage.ts)

#### Fonts
- `getFonts(): Promise<Font[]>`
- `getFont(fontId): Promise<Font | undefined>`
- `addFont(font): Promise<void>`
- `deleteFont(fontId, force): Promise<void>` (checks in-use)

#### Palettes
- `getPalettes(): Promise<Palette[]>`
- `getPalette(paletteId): Promise<Palette | undefined>`
- `addPalette(palette): Promise<void>`
- `deletePalette(paletteId, force): Promise<void>` (checks in-use)

#### Layer Operations
- `addLayer(shotId, layer): Promise<void>`
- `updateLayer(layerId, layer): Promise<void>`
- `deleteLayer(layerId): Promise<void>`
- `getLayersForShot(shotId): Promise<StoryboardLayer[]>`
- `validateLayerReferences(layer, gameId): Promise<ValidationResult>`

#### In-Use Checks
- `getAssetUsage(assetId): Promise<{ scenes: string[], layers: string[] }>`
- `getStateUsage(stateId): Promise<{ scenes: string[], layers: string[] }>`
- `getFontUsage(fontId): Promise<{ layers: string[] }>`
- `getPaletteUsage(paletteId): Promise<{ layers: string[] }>`

---

## UI Additions

### Assets View Enhancement
1. **Import static image without state** (verify P1 UI gap)
   - File picker → direct thumbnail upload
   - No AssetState creation required
   - Sets `asset.thumbnail` directly

### Scene/Storyboard Layer Editor
1. **Add visual asset layer**
   - Asset picker (game-scoped)
   - State selector (with "Use Default" option)
   - Preview thumbnail

2. **Add text layer**
   - Text input field
   - Font selector (with "Default" option)
   - Palette selector (with "Default" option)
   - Preview with styled text

3. **Layer visibility toggle**
   - Eye icon to show/hide layer
   - Grayed out when hidden

4. **Layer list**
   - Shows asset name + state name (if not default)
   - Shows text content preview
   - Visual indicators for broken references

---

## Rendering Semantics

### Layer Rendering Order
1. Resolve content type (asset > character > pose > clip > image > text)
2. If visualAssetId:
   - Resolve asset → validate gameId matches
   - If assetStateId = null, use asset.defaultStateId
   - Else use explicit assetStateId
   - Load image from state.file path
3. If text:
   - Resolve fontRef (or use default system font)
   - Resolve paletteRef (or use default colors)
   - Render text with font/palette styling
4. Apply transform (x, y, scale, rotation, flipX, opacity)
5. Apply fx (dropShadow, outerGlow)
6. Skip if visible = false

### Font Fallback
- `fontRef = undefined` → System default (e.g., Arial 16px)
- `fontRef = "default"` → App default font (configured in settings)
- `fontRef = <fontId>` → Resolve to Font, fallback to system if missing

### Palette Fallback
- `paletteRef = undefined` → System default (black text, white bg)
- `paletteRef = "default"` → App default palette (configured in settings)
- `paletteRef = <paletteId>` → Resolve to Palette, fallback to system if missing

---

## Testing Strategy

### CLI Tests
1. Create scene → add shot → add asset layer → verify persistence
2. Create scene → add shot → add text layer → verify persistence
3. Delete asset referenced by layer → verify rejection
4. Delete asset with --force → verify layer marked broken
5. Cross-game reference → verify rejection
6. Missing asset reference → verify warning

### UI Tests (Manual)
1. Assets view → Import static image → Verify thumbnail shows
2. Scene editor → Add asset layer → Select state → Preview
3. Scene editor → Add text layer → Style text → Preview
4. Scene editor → Toggle visibility → Verify layer hidden
5. Game dropdown → Switch game → Verify layers scoped

### Storage Tests
1. Layer CRUD operations
2. In-use checks (assets, states, fonts, palettes)
3. Reference validation (cross-game, missing refs)
4. Default state resolution

---

## Migration Plan

### Existing Data Compatibility
- **Scenes**: Add empty `fonts: []`, `palettes: []` on load if missing
- **StoryboardLayers**: Add `visible: true` default if missing
- **No breaking changes**: Existing character/pose/clip layers continue to work

### Schema Version
- Increment to `schemaVersion: 2` for AssetPipelineProject with fonts/palettes
- Migration function in studioStorage.ts to upgrade v1 → v2

---

## Success Criteria

### P2 Complete When:
1. ✅ CLI: All scene/shot/layer/font/palette commands functional
2. ✅ Storage: All CRUD operations + validation + in-use checks
3. ✅ UI: Asset import/replace without dummy state (P1 gap)
4. ✅ UI: Visual asset layers render in scene preview
5. ✅ UI: Text layers render with font/palette styling
6. ✅ Tests: CLI roundtrip, reference validation, in-use protection
7. ✅ Build: TypeScript clean, no breaking changes
8. ✅ Docs: Updated CLI reference, schema docs

---

**Contract End** - Implementation begins after approval
