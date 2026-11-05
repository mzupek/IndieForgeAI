/**
 * Seed game definition from the Neon Recall current-state markdown
 */

import type { GameDefinition, MVPBoardItem } from '@shared/types/assetPipeline'
import { randomUUID } from 'crypto'

/**
 * Parse the Neon Recall current-state markdown and create a seeded game definition
 */
export function seedNeonRecallDefinition(
  gameId: string,
  markdownContent: string
): Omit<GameDefinition, 'id' | 'createdAt' | 'updatedAt'> {
  const now = new Date().toISOString()
  
  return {
    gameId,
    stage: 'MVP',
    pillars: [
      'Marvel vs Capcom-style presentation: big fighters, graphic-novel poses + short Runway clips',
      'Memory board as the only combat verb (Simon Says pattern reuse)',
      'Gate Drone as sole MVP boss - perfect one fight loop first',
      'Neon apocalyptic techno theme throughout'
    ],
    puzzleCore: `Simon Says memory board reused by Adventure:
- PatternManager + SequencePlayer + board spawn via GameModeController
- Pattern-shape library ScriptableObjects: Box, Cross, Diagonal, L-Shape, Line, Reverse L, T-Shape, Zigzag
- ShapeRecognitionManager shows "Recognized: {shapeName}" cue
- Scale-matched tile tones via AudioPitchMapper / PatternAudioController (pentatonic, basePitch = 0.75)
- Difficulty profiles Easy / Normal / Hard (Classic arcade)

Adventure battle loop:
1. Load encounter → EncounterConfig or runtime defaults
2. Start → round counter 1, callouts WATCH / YOUR TURN
3. Round complete → enemy HP -= damagePerHit (10), enemy pose hurt or defeat, combo++, callout path to VICTORY! if HP ≤ 0
4. Pattern fail → callout MISS, hero HP -= 10, pose hurt/defeat, DEFEATED if HP ≤ 0
5. Post-battle → wait 3s, log transition (TODO: results screen)

Flow: Title (Adventure) → Backstory (3 neon-apocalypse panels) → Adventure_Walk (hover-ride to checkpoint) → Transition → Adventure_Puzzle → (intended) Results

Walk is side-scrolling hover ride (WalkController / HoverRide), not a top-down map with NPCs/shops.`,
    
    storySynopsis: `Neon Recall is set in a neon-apocalyptic techno world where the hacker hero rides a hover-board through corrupted systems, battling memory-based security threats. The Gate Drone is the first major adversary - a security system that challenges the hero's pattern recognition abilities in a high-stakes Simon Says battle.

The adventure mode focuses on perfecting a single dramatic encounter against the Gate Drone, with Marvel vs Capcom-style presentation: big fighters on screen, dramatic zoom punches, freeze frames on KO, and graphic-novel static poses combined with short Runway-generated clips for key battle moments (intro, hit, finisher, defeat).`,
    
    cast: [],
    
    linkedAssets: {
      poses: [],
      clips: [],
      presets: []
    },
    
    themeSlots: [
      {
        id: randomUUID(),
        name: 'Title Screen',
        description: 'Adventure + Classic mode buttons',
        reference: 'Title.unity scene, TitleController'
      },
      {
        id: randomUUID(),
        name: 'Battle HUD',
        description: 'Runtime-built: Portraits, HP, round, combo, WATCH/YOUR TURN/MISS/VICTORY/DEFEATED, pause stub',
        reference: 'Adventure battle HUD in Adventure_Puzzle scene'
      },
      {
        id: randomUUID(),
        name: 'Backstory Panels',
        description: '3 neon-apocalypse panels with typewriter text + Continue/Skip buttons',
        reference: 'Backstory.unity scene'
      },
      {
        id: randomUUID(),
        name: 'Versus Presentation',
        description: 'VS clip + ready poses, Marvel vs Capcom style intro',
        reference: 'versus preset (front, zoom 1, padding 50, Hero left / Gate Drone right)'
      },
      {
        id: randomUUID(),
        name: 'Battle Moments',
        description: 'Zoom punch (1.15×, 180ms), flash (#ffffff, 200ms, 0.8 opacity), shake effects',
        reference: 'zoom_punch, flash, shake, freeze presets tagged gate-drone'
      }
    ],
    
    interactions: [
      {
        id: randomUUID(),
        name: 'Pattern Recognition',
        description: 'Player watches enemy pattern sequence then replicates it on memory board. Success = damage to enemy, failure = damage to hero. Shape recognition provides visual cue.',
        assetRefs: ['PatternManager', 'SequencePlayer', 'ShapeRecognitionManager']
      },
      {
        id: randomUUID(),
        name: 'Battle Cinematics',
        description: 'Intro: VS clip + ready poses. Hit: zoom punch + flash + hit clip. Miss: shake effect. KO: freeze + shake + finisher clip. Dynamic pose swapping based on HP states.',
        assetRefs: ['PoseSwapper', 'BattleController', 'versus preset', 'zoom_punch preset', 'flash preset', 'shake preset', 'freeze preset']
      },
      {
        id: randomUUID(),
        name: 'Hover Ride Walk',
        description: 'Side-scrolling segment where hero rides hover-board to battle checkpoint. Auto-advance to transition.',
        assetRefs: ['WalkController', 'HoverRide', 'Adventure_Walk scene']
      }
    ],
    
    tuningProfiles: [
      {
        id: randomUUID(),
        name: 'Hero Stats',
        params: {
          hp: 100,
          maxHP: 100,
          damagePerHit: 10
        },
        notes: 'Current hardcoded values in BattleController'
      },
      {
        id: randomUUID(),
        name: 'Gate Drone Encounter',
        params: {
          enemyHP: 20,
          patternLength: 4,
          rounds: 10,
          targetDurationSec: 75
        },
        notes: 'GameFlowManager Gate Drone values. Target 60-90s fight length. Current damage/HP implies ~10 rounds.'
      },
      {
        id: randomUUID(),
        name: 'Classic Difficulty Profiles',
        params: {
          easy_initialPatternLength: 2,
          easy_mistakeTolerance: 1,
          easy_scoreMultiplier: 0.8,
          normal_initialPatternLength: 2,
          normal_mistakeTolerance: 0,
          normal_scoreMultiplier: 1.0,
          hard_initialPatternLength: 2,
          hard_mistakeTolerance: 0,
          hard_scoreMultiplier: 1.5
        },
        notes: 'DifficultyProfiles ScriptableObjects for Classic Endless Arcade mode'
      },
      {
        id: randomUUID(),
        name: 'Audio',
        params: {
          basePitch: 0.75,
          pentatonicScale: true
        },
        notes: 'AudioPitchMapper for tile tones. World music loops: Neon Circuitry, Cyberpunk, Synth Sunset, Arcade Pulse, Ethereal Arcade'
      }
    ],
    
    keepCutInvent: {
      keep: [
        'Classic Endless Arcade intact (do not couple Adventure progression into Classic worlds)',
        'Adventure scene chain and GameFlowManager singleton bootstrap',
        'Memory board as the only combat verb',
        'Indie Forge pose slots (ready/success/hurt/win/defeat) matching CharacterData',
        'Pattern shape library + recognized cue (Classic; optional in battle later)',
        'Runtime Battle HUD / Classic UI strip pattern',
        'Gate Drone as sole MVP boss'
      ],
      cut: [
        'Sentinel / multi-encounter chapter',
        'Top-down map, shops, NPCs, side quests, mini-games',
        'Rig-based hero animation for battle (keep graphic-novel poses + clips)',
        'Adventure energy/ability HUD complexity (AdventureHUD abilities) until Gate Drone fight feels right',
        'Perfect Classic Title button wiring (Classic already playable via Gameplay)'
      ],
      invent: [
        'Tunable EncounterConfig asset for Gate Drone (HP, damage, pattern length, rounds) targeting 60-90s',
        'Import Gate Drone approved poses into Unity enemy path (or Resources)',
        'Wire moment → pose/clip/preset player (intro / hit / miss / KO)',
        'Battle SFX: hit, miss, KO',
        'Finish win/loss → Results / CompleteEncounter',
        'Produce missing clips: finisher, defeat, hero set',
        'Reconcile HP sources (GameFlow 20 vs EncounterManager 30 vs EncounterConfig 0 vs hero 100 / dmg 10)'
      ]
    },
    
    mvpBoard: [
      {
        id: randomUUID(),
        item: 'Hero character + 5 approved poses',
        type: 'asset',
        status: 'done',
        notes: 'Indie Forge + Assets/Art/Characters/Hero/Poses'
      },
      {
        id: randomUUID(),
        item: 'Gate Drone character + 5 approved poses',
        type: 'asset',
        status: 'partial',
        notes: 'Done in Forge; not in Unity (no Enemies folder)'
      },
      {
        id: randomUUID(),
        item: 'Gate Drone intro clip',
        type: 'asset',
        status: 'done',
        notes: 'clip e98b0a86-... moment intro'
      },
      {
        id: randomUUID(),
        item: 'Gate Drone hit clip',
        type: 'asset',
        status: 'done',
        notes: 'clip ef59207f-... moment hit'
      },
      {
        id: randomUUID(),
        item: 'Finisher / defeat / hero clips',
        type: 'asset',
        status: 'needed',
        notes: 'Still missing in clip list'
      },
      {
        id: randomUUID(),
        item: 'Versus / zoom_punch / flash / shake / freeze presets',
        type: 'asset',
        status: 'done',
        notes: 'preset list tagged gate-drone'
      },
      {
        id: randomUUID(),
        item: 'EncounterConfig gate_drone ScriptableObject',
        type: 'asset',
        status: 'needed',
        notes: 'Code expects Resources/Encounters/gate_drone'
      },
      {
        id: randomUUID(),
        item: 'CharacterData Resources',
        type: 'asset',
        status: 'needed',
        notes: 'Code expects Resources/Characters/hero (+ enemy)'
      },
      {
        id: randomUUID(),
        item: 'Adventure_Puzzle scene + BattleController',
        type: 'system',
        status: 'partial',
        notes: 'Present; local fixes untested'
      },
      {
        id: randomUUID(),
        item: 'BattleBootstrap Classic UI strip',
        type: 'system',
        status: 'partial',
        notes: 'Uncommitted .enabled fix'
      },
      {
        id: randomUUID(),
        item: 'Memory pattern loop in battle',
        type: 'system',
        status: 'partial',
        notes: 'Auto-start via GMC in uncommitted diff'
      },
      {
        id: randomUUID(),
        item: 'Pose swap on hit/miss/KO',
        type: 'system',
        status: 'partial',
        notes: 'Poses wired; enemy art placeholders'
      },
      {
        id: randomUUID(),
        item: 'Clip + preset playback in battle',
        type: 'system',
        status: 'needed',
        notes: 'No Unity VideoPlayer battle wiring'
      },
      {
        id: randomUUID(),
        item: 'HP / damage / pattern length tuning for 60-90s',
        type: 'tuning',
        status: 'needed',
        notes: 'Hardcoded 100 HP / 10 dmg; conflicting enemy HP'
      },
      {
        id: randomUUID(),
        item: 'Battle SFX (hit/miss/KO)',
        type: 'asset',
        status: 'needed',
        notes: 'Not present'
      },
      {
        id: randomUUID(),
        item: 'Win/loss → Results flow',
        type: 'system',
        status: 'needed',
        notes: '3s wait + TODO log only'
      },
      {
        id: randomUUID(),
        item: 'Title → Backstory → Walk → Puzzle chain',
        type: 'system',
        status: 'done',
        notes: 'Verified scene + controllers'
      },
      {
        id: randomUUID(),
        item: 'Top-down map / shops / NPCs',
        type: 'system',
        status: 'cut',
        notes: 'Out of MVP; not present'
      },
      {
        id: randomUUID(),
        item: 'Classic arcade',
        type: 'system',
        status: 'done',
        notes: 'Gameplay.unity + profiles - keep as-is'
      }
    ],
    
    markdownSource: markdownContent
  }
}
