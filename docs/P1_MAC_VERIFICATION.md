# P1 Mac Verification Instructions

**Commit**: `74162be`  
**Date**: November 6, 2026  
**Status**: Ready for Mac testing

---

## What Was Fixed

### 1. Static Asset Image Import ✅
- **CLI**: Added `--image` flag to `forge asset create` and `forge asset update`
- **Behavior**: Imports PNG, generates 256x256 thumbnail, stores in app-managed paths
- **No dummy state required**: Single-image assets work without creating an AssetState

### 2. Game Dropdown Switching ✅
- **UI**: `StudioHome.handleGameChange` now navigates Assets view
- **Behavior**: Switching game dropdown refreshes Assets list with new game's assets
- **Preserves view**: Stays on Assets tab, just updates gameId in URL

### 3. Thumbnail Display ✅
- **UI**: `AssetLibrary` renders actual thumbnail images
- **Fallback**: Shows category emoji icons if no thumbnail exists
- **Protocol**: Uses `local-file://` for Electron file access

### 4. Test Runner ✅
- **Script**: `test-p1-mac.sh` - executable, Mac-compatible test
- **No tsx**: Uses built CLI output (`node out/cli/forge.js`)
- **Isolated data**: Creates temp directory, no real project pollution
- **Coverage**: All P1 features (static image, states, guards, CLI syntax)

---

## Mac Verification Commands

### Prerequisites
```bash
cd /path/to/IndieForgeAI
git checkout cursor/phase-c-scenes-spine-ac38
git pull origin cursor/phase-c-scenes-spine-ac38  # Ensure you have 74162be
npm install  # If needed
npm run build  # Build fresh
```

### Test 1: Automated CLI Tests (Required)
```bash
./test-p1-mac.sh
```

**Expected Output**:
```
==========================================
P1 Mac Verification Test
==========================================
...
[32mAll P1 CLI tests passed![0m
==========================================

Verified:
  ✓ Static asset creation without image
  ✓ Static asset creation WITH image (--image flag)
  ✓ Asset update to add image
  ✓ Thumbnail generation and file persistence
  ✓ Game-scoped asset listing
  ✓ Multi-state asset workflow
  ✓ Guard: Default state deletion prevention
  ✓ Cascade delete (asset + owned states)
  ✓ CLI syntax consistency (--game flag)
```

**If test fails**: Report exact error message and line number

---

### Test 2: Manual UI Tests (Required)

#### 2.1 Game Dropdown Switching
```bash
npm start  # Launch Electron app
```

**Steps**:
1. Navigate to **Assets** tab in sidebar
2. Note current game in top-right dropdown (e.g., "Neon Recall")
3. Change game dropdown to different game
4. **Expected**: Assets list refreshes, shows assets for new game
5. **Expected**: URL updates to `/studio/assets/<new-game-id>`
6. Switch back to original game
7. **Expected**: Assets list refreshes again

**Pass Criteria**: Assets list updates immediately when game dropdown changes

---

#### 2.2 Static Asset Image Import & Preview
```bash
# Prepare a test PNG image on your desktop or downloads folder
# Any PNG file works (logo, icon, photo, etc.)
```

**Steps**:
1. In Assets tab, click **"+ New Asset"**
2. Enter name: "Test Logo"
3. Enter category: "logo"
4. Asset created, editor opens automatically
5. In editor, leave metadata as-is, close editor
6. **Observe**: Asset shows emoji icon 🏷️ (no thumbnail yet)
7. Select asset, click **"Edit"**
8. Click **"+ Add State"**
9. Enter state name: "default"
10. File picker opens → Select your test PNG
11. **Expected**: State appears with "DEFAULT" badge
12. Close editor
13. **Observe**: Asset card now shows actual thumbnail image (not emoji)
14. **Expected**: Thumbnail is visible, recognizable preview of uploaded image

**Pass Criteria**: Thumbnail displays actual image content

---

#### 2.3 Static Asset via CLI (Alternative Workflow)
```bash
# Create test image if needed
# For example: /tmp/test-logo.png

# Create asset with image in one command
node out/cli/forge.js asset create \
  --game game-neon-recall \
  --name "CLI Logo" \
  --category logo \
  --image /path/to/your/test-logo.png

# Verify in UI
npm start
# Navigate to Assets tab
# Find "CLI Logo" asset
# Verify thumbnail shows
```

**Pass Criteria**: Asset appears in UI with thumbnail

---

### Test 3: CLI Syntax Verification (Quick Check)
```bash
node out/cli/forge.js asset create --help
```

**Expected Output**:
```
Usage: forge asset create [options]

Create a new visual asset

Options:
  --game <id>            Game ID
  --name <name>          Asset name
  --category <category>  Category (logo|symbol|item|weapon|prop)
  --tags <tags>          Comma-separated tags
  --image <path>         PNG image file path (for static single-image assets)
  -h, --help             display help for command
```

**Verify**: `--image` option is documented

---

## Known Limitations

### Not Yet Implemented (Future)
- Drag-drop file upload (uses file picker for now)
- Bounding box editor UI (CLI supported, UI pending)
- Asset library pagination (works fine for <100 assets)
- Real image preview in state editor (shows 🖼️ icon placeholder)

### Workarounds
- **Multiple images per asset**: Use asset states (multi-state workflow)
- **Edit image after upload**: Use `forge asset update --image` or add new state

---

## Troubleshooting

### Test Script Fails: "Cannot find module"
- **Cause**: Build not run or out of date
- **Fix**: `npm run build` then retry

### Test Script Fails: "Game not found"
- **Cause**: studio.json structure mismatch (shouldn't happen with provided script)
- **Fix**: Script creates isolated test data, should not depend on user data

### UI: Thumbnails Don't Show
- **Check**: DevTools console for errors
- **Check**: File exists at path shown in `forge asset show <assetId>`
- **Protocol**: Ensure `local-file://` protocol registered in Electron

### UI: Game Dropdown Doesn't Refresh Assets
- **Check**: URL actually changes (watch address bar equivalent in Electron)
- **Check**: Browser console for React errors
- **Fallback**: Manual navigate by clicking Assets tab again

---

## Success Criteria Summary

| Test | Requirement | Status |
|------|-------------|--------|
| **CLI Automated** | `./test-p1-mac.sh` passes all checks | ⏳ Awaiting Mac |
| **UI Game Switch** | Assets list refreshes on dropdown change | ⏳ Awaiting Mac |
| **UI Thumbnail** | Static asset shows image preview | ⏳ Awaiting Mac |
| **CLI Syntax** | `--image` flag documented in `--help` | ✅ Verified cloud |

---

## Reporting Results

### If All Tests Pass
Reply with:
```
✅ P1 Mac verification complete
- ./test-p1-mac.sh: PASS
- Game dropdown switching: PASS  
- Thumbnail preview: PASS
- Ready for deployment
```

### If Any Test Fails
Report:
1. Which test failed (exact test name/number)
2. Exact error message or observed behavior
3. Expected vs actual behavior
4. Screenshot if UI issue
5. Console logs if applicable

---

## Next Steps After Verification

1. ✅ **If tests pass**: P1 complete, proceed to P2 (Pose Events)
2. ❌ **If tests fail**: Agent patches minimal fix, re-verify

**No P2 work until P1 fully verified on Mac**

---

## Files Changed in 74162be

```
src/cli/commands/asset.ts       - Added --image support to create/update
src/cli/forge.ts                - Registered --image CLI option
src/renderer/components/AssetLibrary.tsx  - Thumbnail image rendering
src/renderer/components/StudioHome.tsx    - Game dropdown navigation fix
test-p1-mac.sh                  - Executable Mac test runner (NEW)
```

---

**End of Mac Verification Instructions**
