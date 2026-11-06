# Indie Forge AI

Personal **studio brain** for a one-person indie studio: plan scenes and assets, craft pixel silhouettes, define motion mechanically, and hand off to **Aseprite** / **Godot** / **Unity** with Cursor agent kits.

Indie Forge does **not** try to replace Aseprite, Godot, or Unity — or ship final neon art from OpenAI.

## Exemplars

| Project | Engine | Craft path |
|---------|--------|------------|
| **Ring'Em Up** | Godot | Pixel: silhouette → motion → pose sheet → Aseprite skin |
| **Neon Recall** | Unity | Materials / VFX / levels (plan here, build in Unity) |

## What Indie Forge owns

- Project profile: `engine` + `craftPath`
- **Game Definitions** (Phase B): living design docs with structured data + markdown
- **Scenes** (Phase C): narrative moments with cast, story, attached storyboards, FX recipe refs
- Characters, Poses (1024×1024 PNG), Clips (video)
- **Storyboards** (Phase 4.5): shot-by-shot animatics with effect markers (juice in context)
- FX recipe library (behind-the-scenes; created/edited from storyboard timeline)
- **Craft Studio** (pixel silhouette / paint / guide photo)
- **Motion Studio** (rig, key poses, Motion Blueprint JSON — no art)
- **Animation Studio** (Craft guide + Motion Blueprint skeleton frames → Aseprite)
- **Production** recipes + copyable Cursor prompts
- **Studio Kit** export (`docs/`, `.cursor/rules/`, MCP + package recommendations)

## What stays outside

- Costume / final pixel animation → **Aseprite**
- Materials, bloom, VFX Graph → Unity
- Sprite2D / scene tree → Godot
- MCP servers → install in the **game repo** Cursor, not inside this Electron app

## Stack

- Electron + electron-vite
- React + TypeScript
- Zustand
- Local JSON projects
- OpenAI optional (planning — not inventing swing frames)
- Sharp for pose export

## Setup

```bash
npm install
cp .env.example .env
# Optional: OPENAI_API_KEY for AI Plan
npm run dev
```

## CLI Agent Scaffold Path

Engineering agents can scaffold MVP scenes + storyboards via CLI; humans polish assets in UI:

```bash
# 1. Create scene with cast
forge scene create --game game-neon-recall --name "Gate Drone Battle" \
  --description "Player encounters Gate Drone" \
  --story-text "Warning: Memory fragment detected." \
  --json > scene.json

SCENE_ID=$(jq -r .id scene.json)

# 2. Attach storyboard
forge scene attach-storyboard --id $SCENE_ID --name "Battle Animatic" --json > board.json
BOARD_ID=$(jq -r .storyboardId board.json)

# 3. Add shots with layers, camera, effects
SHOT_ID=$(forge shot add --storyboard $BOARD_ID --name "Establish" --duration 2.5 --json | jq -r .id)

# Add pose layer (character + pose)
forge layer add --shot $SHOT_ID --z 1 --character char-drone-001 --pose pose-ready-001 \
  --x 0.5 --y 0.4 --scale 1.0

# Timed pose/state keys on that same layer (P4 step/hold; not a duplicate layer)
forge layer key add --shot $SHOT_ID --layer $LAYER_ID --time 1.0 --pose pose-hurt-001

# Add camera keyframe (framing example)
forge camera add --shot $SHOT_ID --time 0.0 --target char-drone-001 --zoom 1.5

# Add effect at hit moment
forge effect add --shot $SHOT_ID --time 1.2 --moment hit --preset shake-impact-001

# Human then imports poses/clips in UI and polishes
```

### Quick Reference
- **game/games** - Both `forge game list` and `forge games list` work
- **Moments** - `intro`, `hit`, `finisher`, `defeat`, `miss`, `story_beat`
- **Layers** - Use `--pose` for character poses, `--clip` for animations, `--image` for statics
- **Camera** - Target layers by ID or explicit `{x, y}` point; zoom 1.0 = normal, 2.0 = 2x
- **Stage Treatment** (Phase C.1) - `--bg-dim 0.35 --vignette 0.4` darkens background (0-1) without affecting character layers
- **Layer Effects** (Phase C.2) - `--glow-blur 12 --glow-alpha 0.8 --glow-color '#00ffff'` for outer glow; `--shadow-x 4 --shadow-y 6 --shadow-blur 10 --shadow-alpha 0.5` for drop shadow

See `forge scene --help`, `forge storyboard --help`, `forge shot --help`, `forge layer --help`, `forge layer key --help` for full CLI.

## Workflow

1. **New Project** — pick Ring'Em Up (Godot) or Neon Recall (Unity) template, or blank + engine.
2. **Production** — follow the recipe; export Studio Kit into your engine repo.
3. **Ring'Em Up** — Assets → Craft Studio (guide) → **Motion Studio** (keys) → **Animation Studio** (export guide + skeleton frames) → **Aseprite** (paint) → Godot nearest import.
4. **Neon Recall** — Production Cursor prompts → Unity materials / bloom / VFX.

### Motion Studio (pixel path)

Human owns mechanics: joints, foot contacts, bat arc, constraints. AI never invents poses here.

### Animation Studio thesis (base sprite + motion guide)

**No mannequin.** Craft makes the character. Motion Blueprint is the motion guide. Aseprite applies the guide to the base.

```
Craft
  → guide photo → silhouette / paint  (= BASE sprite)
Motion Studio
  → key the thin skeleton
Animation Studio
  → scrub + approve → export:
        *_01_BASE_SPRITE.png             ← Craft character from guide
        frames/*_motion_XX.png           ← skeleton motion guide (~11 frames)
        frames/*_motion_overlay_XX.png   ← onion-skin over the base
  → Aseprite: reshape BASE to each skeleton pose → engine
```

| Layer | Owns |
|-------|------|
| Craft | Guide → BASE sprite (character) |
| Director | Motion Blueprint keys |
| Skeleton frames | Motion guide only |
| Aseprite | Apply motion guide to BASE; final pixels |
| Mannequin | Not used |

Schema: `resolveProductionGate`, `poseSheetExportService.ts`, `skeletonFrameSvg.ts`.

## Project data

`~/Library/Application Support/indie-forge-ai/projects/` (macOS)

Opening Batter swing in Motion Studio creates a starter RH batter Motion Blueprint if missing.

### Motion diagnostics

Motion and Animation studios can **Copy diagnostic JSON** or **Export diagnostic file** under the asset’s `generated/.../diagnostics/` folder.
