# Library vs Assets: Current State & Integration Plan

**Date**: November 6, 2026  
**Status**: Analysis requested before P2 expansion  
**Issue**: User noticed "Library" nav item (Phase 5) and new "Assets" tab (P1)

---

## Current State (Commit adb0db1)

### Library (Phase 5)
**Status**: **Placeholder only** - No implementation

**Location**: `/studio/library`  
**Component**: `LibraryPlaceholder` (`src/renderer/components/ComingSoon.tsx`)  
**Display**: "⏳ Library - This section is coming in Phase 5"

**Intended Scope** (per original plan):
- Unified browse/search/filter for ALL asset types
- Characters, Poses, Clips, Scenes, Visual Assets
- Cross-game view (optional)
- Advanced search (tags, categories, usage)
- Bulk operations
- Asset previews with metadata

**Current Implementation**: None - just placeholder message

---

### Assets (P1)
**Status**: **Fully implemented** (CLI + UI + Storage)

**Location**: `/studio/assets/:gameId`  
**Component**: `AssetsView`, `AssetLibrary`, `AssetEditor`  
**Display**: Grid view with create/edit/delete for Visual Assets

**Actual Scope**:
- Visual Assets only (logo, symbol, item, weapon, prop)
- Asset States (multi-state variations)
- Game-scoped (respects selected game dropdown)
- CRUD operations (create, read, update, delete)
- Static image import (--image flag)
- Thumbnail generation and preview
- State management (default state selection)
- CLI parity (`forge asset`, `forge asset-state`)

**Current Implementation**: Complete for Visual Assets only

---

## Comparison

| Feature | Library (Phase 5) | Assets (P1) |
|---------|------------------|-------------|
| **Status** | Placeholder | Fully implemented |
| **Scope** | All asset types | Visual Assets only |
| **View** | None yet | Grid with thumbnails |
| **Search** | Intended | Implemented (name/tags) |
| **Filter** | Intended | Implemented (category) |
| **Create** | Intended | Implemented |
| **Edit** | Intended | Implemented (AssetEditor modal) |
| **Delete** | Intended | Implemented (with guards) |
| **Game Scope** | Optional cross-game | Game-scoped (dropdown) |
| **CLI Support** | No | Yes (`forge asset`, `forge asset-state`) |
| **Asset States** | N/A | Implemented |
| **Static Images** | N/A | Implemented (thumbnail preview) |

---

## The Problem

**Duplicate Libraries**:
- Library nav → Placeholder ("Coming Soon")
- Assets nav → Working implementation (Visual Assets only)

**User Confusion**:
- Two nav items that seem related but serve different purposes
- Unclear which to use for asset management
- Assets is "hidden" between Clips and Scenes (not obvious)

**Incomplete Coverage**:
- Assets (P1) handles Visual Assets only
- Characters/Poses/Clips still have their own dedicated views
- No unified browse/search across all asset types (Library's intended purpose)

---

## Recommendations

### Option 1: Integrate Visual Assets into Library (Recommended)

**Approach**: Move Visual Assets functionality into existing Library placeholder

**Changes**:
1. Remove "Assets" nav item
2. Implement Library view with tabs:
   - **Visual Assets** tab → Current AssetsView implementation
   - **Characters** tab → Link to Characters view (or embedded)
   - **Poses** tab → Link to Poses view (or embedded)
   - **Clips** tab → Link to Clips view (or embedded)
   - **All** tab → Unified view (future)
3. Keep existing dedicated views (Characters, Poses, Clips)
4. Library becomes the "hub" for browsing all assets

**Pros**:
- ✅ No duplicate navigation items
- ✅ Matches original Phase 5 plan
- ✅ Visual Assets get proper placement
- ✅ Clear path for future unified view

**Cons**:
- ⚠️ Requires refactoring existing Visual Assets UI
- ⚠️ More work before P2 can proceed

---

### Option 2: Keep Separate, Rename Assets (Quick Fix)

**Approach**: Keep both, but clarify naming

**Changes**:
1. Rename "Assets" nav → "Props & Items" or "Visual Elements"
2. Keep Library as placeholder for future unified view
3. Document that Library will eventually absorb Assets tab

**Pros**:
- ✅ Minimal code changes
- ✅ Preserves P1 work as-is
- ✅ Can proceed with P2 immediately

**Cons**:
- ❌ Still have two asset-related nav items
- ❌ User confusion persists
- ❌ Creates tech debt (refactor later)

---

### Option 3: Assets as Library (Expand in Place)

**Approach**: Treat current "Assets" as early Library implementation

**Changes**:
1. Remove Library placeholder nav item
2. Rename "Assets" nav → "Library"
3. Add tabs to AssetsView:
   - Visual Assets (current)
   - Characters (links to `/studio/characters/:gameId`)
   - Poses (links to `/studio/poses/:gameId`)
   - Clips (links to `/studio/clips/:gameId`)
4. Evolve AssetsView into full Library over time

**Pros**:
- ✅ Immediate resolution (no placeholder)
- ✅ Visual Assets become "first tab" of Library
- ✅ Clear expansion path

**Cons**:
- ⚠️ Deviates from original Phase 5 plan
- ⚠️ Assets becomes Library prematurely
- ⚠️ May need rework when full Library features arrive

---

## Data & Code Impact

### Current Assets Code (Preserve)
- ✅ `src/renderer/components/AssetLibrary.tsx` - Grid view, search, filter
- ✅ `src/renderer/components/AssetEditor.tsx` - Modal editor
- ✅ `src/renderer/components/AssetsView.tsx` - Main view wrapper
- ✅ `src/cli/commands/asset.ts` - CLI CRUD for Visual Assets
- ✅ `src/cli/commands/asset-state.ts` - CLI CRUD for Asset States
- ✅ `src/core/storage/studioStorage.ts` - Storage methods + guards
- ✅ All P1 data schemas (VisualAsset, AssetState)

**None of this code is wasted** - it will be used regardless of nav structure.

### Library Placeholder Code (Replace)
- 🗑️ `LibraryPlaceholder` in `ComingSoon.tsx` - Just 3 lines, throwaway

---

## Recommended Action (Minimal Impact)

**Defer to user**, but recommend **Option 3** (Assets as Library) for these reasons:

1. **No user confusion**: One asset browsing location
2. **Minimal code changes**: Just rename nav + add tab links
3. **P2 can proceed**: No blocking refactor needed
4. **Preserves all P1 work**: Visual Assets tab is ready
5. **Clear expansion path**: Add more tabs as features arrive

**Implementation** (if approved):
```diff
// App.tsx - Navigation
- { path: '/studio/assets', label: 'Assets', phase: 'P1', live: true },
- { path: '/studio/library', label: 'Library', phase: 5 },
+ { path: '/studio/library', label: 'Library', phase: 'P1+', live: true },

// AssetsView.tsx → LibraryView.tsx
<h2>Visual Assets (P1)</h2>
↓
<h2>Library</h2>
<Tabs>
  <Tab name="Visual Assets">
    <AssetLibrary ... />
  </Tab>
  <Tab name="Characters">
    <Link to={`/studio/characters/${gameId}`}>View Characters →</Link>
  </Tab>
  { /* More tabs */ }
</Tabs>
```

---

## User Question Summary

**Q**: Is Library basically Assets?  
**A**: No - Library is a placeholder. Assets is the only working implementation (Visual Assets only).

**Q**: What differs?  
**A**: Library = Phase 5 plan (unified all-asset browse). Assets = P1 delivery (Visual Assets CRUD).

**Q**: How to integrate?  
**A**: Three options (see above). Recommend Option 3: Rename Assets → Library, add tab structure.

---

## Next Steps

1. ✅ **DONE**: P1 crash fix deployed (`adb0db1`)
2. ⏸️ **BLOCKED**: P2 expansion (awaiting Library integration decision)
3. 🤔 **PENDING**: User decides nav structure (Options 1, 2, or 3)
4. 🚀 **THEN**: Proceed with P2 (scene/storyboard layer linkage)

**No code changes made yet** - awaiting user approval on approach.

---

**End of Analysis**
