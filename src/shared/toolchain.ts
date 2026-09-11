import type {
  CraftPath,
  GameEngine,
  IndieForgeProject,
  ProductionPlan,
  ProductionStep,
  ProjectStyleGuide
} from '@shared/types/project'

export interface EngineProfile {
  engine: GameEngine
  craftPath: CraftPath
  label: string
  filtering: 'nearest' | 'linear'
  exportTarget: 'godot' | 'unity'
  defaultStyleGuide: ProjectStyleGuide
  defaultPlatform: string
}

export const ENGINE_PROFILES: Record<GameEngine, EngineProfile> = {
  godot: {
    engine: 'godot',
    craftPath: 'pixel_silhouette',
    label: 'Godot + pixel craft',
    filtering: 'nearest',
    exportTarget: 'godot',
    defaultPlatform: 'Mobile portrait (1080x1920)',
    defaultStyleGuide: {
      artStyle: 'Retro arcade pixel art, clean readable silhouettes',
      perspective: 'side_view',
      colorPalette: 'Navy, white, grass green, dirt tan, umpire black',
      designSpriteWidth: 1024,
      designSpriteHeight: 1024,
      defaultSpriteWidth: 128,
      defaultSpriteHeight: 128,
      defaultBackgroundWidth: 1080,
      defaultBackgroundHeight: 1920,
      notes:
        'Craft at full design resolution (default 1024). Export/in-engine size is separate (default 128). Import to Godot with nearest filtering.'
    }
  },
  unity: {
    engine: 'unity',
    craftPath: 'engine_materials',
    label: 'Unity + materials / VFX',
    filtering: 'linear',
    exportTarget: 'unity',
    defaultPlatform: 'Mobile portrait (1080x1920)',
    defaultStyleGuide: {
      artStyle: '80s neon synthwave, glowing frames, bloom-heavy UI',
      perspective: 'ui_only',
      colorPalette: 'Hot magenta, cyan, lime, deep navy void',
      designSpriteWidth: 512,
      designSpriteHeight: 512,
      defaultSpriteWidth: 256,
      defaultSpriteHeight: 256,
      defaultBackgroundWidth: 1080,
      defaultBackgroundHeight: 1920,
      notes:
        'Final look lives in Unity materials, URP bloom, and VFX. IndieForge plans scenes, tile states, and Cursor handoff — not final neon renders.'
    }
  }
}

export function defaultCraftPathForEngine(engine: GameEngine): CraftPath {
  return ENGINE_PROFILES[engine].craftPath
}

export function buildDefaultProductionPlan(project: IndieForgeProject): ProductionPlan {
  const steps =
    project.engine === 'godot'
      ? godotPixelSteps(project)
      : unityNeonSteps(project)

  return {
    updatedAt: new Date().toISOString(),
    steps
  }
}

function godotPixelSteps(project: IndieForgeProject): ProductionStep[] {
  return [
    {
      id: 'vision',
      title: 'Lock game vision & scenes',
      description: `Confirm scenes and slots for ${project.name}. Use Scene Composer for placement contracts.`,
      tool: 'indie_forge',
      owner: 'human',
      cursorPrompt: undefined
    },
    {
      id: 'silhouette',
      title: 'Silhouette craft for cast & props',
      description:
        'In Craft Studio, draw silhouettes for batter, pitcher, umpire, ball. Color in-app or finish in Aseprite.',
      tool: 'craft_studio',
      owner: 'human'
    },
    {
      id: 'ball-spin',
      title: 'Baseball rotation frames',
      description:
        'Create a master ball silhouette, then duplicate frames at fixed angles (0/45/90…). Keep pivot centered.',
      tool: 'craft_studio',
      owner: 'human',
      cursorPrompt: `In the Godot project for ${project.name}: import the baseball spin sheet as an AtlasTexture / SpriteFrames. Use nearest filter, centered offset, and drive rotation frames from pitch/hit state — do not procedurally warp the bitmap.`
    },
    {
      id: 'godot-import',
      title: 'Import sprites into Godot',
      description:
        'Export atlases from IndieForge. Import with Filter = Nearest, Mipmaps off. Wire AnimatedSprite2D / Sprite2D.',
      tool: 'godot',
      owner: 'cursor_agent',
      cursorPrompt: `You are the Asset Pipeline agent for a Godot 4 mobile game "${project.name}".
Import IndieForge-exported PNGs/atlases under res://assets/.
Set texture filter to Nearest, create SpriteFrames for animations, set pivots from contract bottom_center where noted.
Do not rewrite gameplay systems in this pass — only asset import and scene node wiring for sprites.`
    },
    {
      id: 'systems',
      title: 'Gameplay systems (Godot)',
      description: 'Implement systems folders: Input, PitchCall, Score, Audio — not god-object Player.cs equivalents.',
      tool: 'godot',
      owner: 'cursor_agent',
      cursorPrompt: `You are the Gameplay Engineer for Godot project "${project.name}".
Follow docs/ENGINE_ARCHITECTURE.md. Prefer autoloads for Save/Audio/Events. Keep umpire call logic in a CallSystem, not in the sprite node.
Mobile portrait 1080x1920. Ask before adding large dependencies.`
    },
    {
      id: 'perf',
      title: 'Mobile performance pass',
      description: 'Atlas batching, avoid overdraw on dust FX, profile on device.',
      tool: 'godot',
      owner: 'cursor_agent',
      cursorPrompt: `Performance agent for Godot mobile "${project.name}": check texture sizes, atlas usage, particle counts, and GDScript allocations in hot paths. Prefer atlases over many unique textures.`
    }
  ]
}

function unityNeonSteps(project: IndieForgeProject): ProductionStep[] {
  return [
    {
      id: 'vision',
      title: 'Lock neon vision & level list',
      description: `Inventory scenes/levels for ${project.name}. Magenta/cyan/lime on navy — bloom is a post profile, not baked into every texture.`,
      tool: 'indie_forge',
      owner: 'human'
    },
    {
      id: 'tile-recipe',
      title: 'Neon tile layer recipe',
      description:
        'Per tile state: (1) base shape/mask (2) contact shadow (3) neon edge color (4) shared bloom profile. Build in Unity materials — do not one-shot AI full tiles.',
      tool: 'unity',
      owner: 'cursor_agent',
      cursorPrompt: `You are the Graphics Engineer for Unity URP mobile game "${project.name}" (Neon Recall style).
Create a reusable neon tile material stack:
- Base albedo/mask for rounded square frame
- Optional shadow/decal layer
- Emission/neon edge driven by color property (magenta/cyan/lime)
- Scene uses a shared URP bloom volume — do not bake bloom into textures.
Keep draw calls low for a grid of tiles. Document material properties for designers.`
    },
    {
      id: 'levels',
      title: 'Level / encounter planning',
      description: 'Define level scenes, spawn rules, and tile state machines in Production checklist.',
      tool: 'unity',
      owner: 'cursor_agent',
      cursorPrompt: `Level Designer agent for Unity "${project.name}": propose scene hierarchy for menu + gameplay grid, ScriptableObjects for level layouts, and tile states (idle/selected/matched). No new art pipelines — use material instances.`
    },
    {
      id: 'vfx',
      title: 'Particle stamps & FX',
      description: 'Author small glow/spark stamps; assemble in VFX Graph or Shuriken. IndieForge lists FX assets only.',
      tool: 'unity',
      owner: 'cursor_agent',
      cursorPrompt: `VFX pass for "${project.name}": additive neon spark/glow stamps, short lifetimes, mobile-safe particle budgets. Match magenta/cyan/lime palette.`
    },
    {
      id: 'packages',
      title: 'Adopt proven Unity packages',
      description: 'Prefer UniTask, DOTween, ScriptableObject events, JSON save — do not reinvent.',
      tool: 'unity',
      owner: 'human',
      cursorPrompt: undefined
    },
    {
      id: 'perf',
      title: 'Mobile performance pass',
      description: 'Overdraw from bloom, atlas UI, GC in grid updates.',
      tool: 'unity',
      owner: 'cursor_agent',
      cursorPrompt: `Performance agent for Unity mobile "${project.name}": bloom intensity vs overdraw, UI batching, avoid per-tile GetComponent in Update, texture sizes for neon masks.`
    }
  ]
}
