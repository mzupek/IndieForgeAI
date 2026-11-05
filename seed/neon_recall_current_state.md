# Neon Recall — Current-State Game Definition

**Status:** Verified from Matt’s Mac (`f74a0521-3b47-489c-8512-c82f47a6e481`) on **2026-11-04 23:15 CST**  
**Unity project:** `~/Documents/Agencies/1182/Neon_Recall`  
**Branch:** `feature/adventure-proto` @ `bc42d64`  
**Uncommitted (awaiting retest):** `BattleBootstrap.cs`, `BattleController.cs`, `HUDController.cs`  
**Indie Forge game id:** `game-neon-recall`  
**Product:** `Neon_Recall` / company `1182` / bundle `1.0`

**Label key**
- **[V]** Verified on disk / CLI / code this pass  
- **[K]** Known context from the brief (not re-proven as runtime behavior)  
- **[I]** Inferred / intended / gap analysis (not invented as existing content)

Do **not** treat this as a greenfield design. It describes what exists, what is stubbed, and what is still missing for the Gate Drone MVP slice.

---

## 1. Stage: MVP (Gate Drone slice)

**[V]** Stage focus is Adventure battle against **Gate Drone**, not a full RPG map.

| Area | Reality |
|------|---------|
| Modes | Classic arcade systems live under `Gameplay.unity` + Endless Arcade controllers. Adventure is a separate scene flow (`Title → Backstory → Walk → Transition → Adventure_Puzzle → Results`). |
| MVP enemy | Hardcoded first encounter: `"Gate Drone"` (`EncounterType.Gate`, pattern `4`, hp `20`) in `GameFlowManager`. Second stub encounter `"Sentinel"` (Boss, pattern `6`, hp `50`) exists in code but is **out of MVP board**. |
| Presentation intent | **[K]** Marvel vs Capcom–style: big fighters, slide/shake intros, VS flash, zoom punches; graphic-novel poses + short Runway clips (no rig animation for battle). |
| Code readiness | Battle HUD auto-builds at runtime; puzzle auto-starts via `GameModeController.StartArcadeRun()` (local uncommitted fix). Classic UI is stripped/disabled in `Adventure_Puzzle`. |
| Asset readiness | Indie Forge has approved poses for Hero + Gate Drone and 2 Gate Drone clips + 6 presets. Unity project has Hero pose PNGs only; **no** `Assets/Art/Characters/Enemies/` and **no** `Resources/Characters` / `Resources/Encounters`. |
| Clip pipeline in Unity | **[V]** No battle `VideoPlayer` / clip playback wiring found in Scripts. `ChapterData` can hold a `VideoClip`, but battle moments do not play Forge clips yet. |
| Fight target length | **[K]/[I]** Tunable HP/damage/pattern length aiming ~60–90 s. Current hardcoded damage implies ~10 successful rounds to KO at HP 100 if damage stays 10 — not yet dialed for 60–90 s. |

**MVP definition (current):** Perfect one Gate Drone fight loop (intro → watch/input memory rounds → hit/miss feedback → win/loss), with Forge poses/clips available externally and Unity battle systems partially stubbed.

---

## 2. Puzzle core and loop (implemented or stubbed)

### Classic core **[V]**
Simon Says memory board reused by Adventure:
- `PatternManager` + `SequencePlayer` + board spawn via `GameModeController`
- Pattern-shape library ScriptableObjects: Box, Cross, Diagonal, L-Shape, Line, Reverse L, T-Shape, Zigzag
- `ShapeRecognitionManager` shows **“Recognized: {shapeName}”** cue
- Scale-matched tile tones via `AudioPitchMapper` / `PatternAudioController` (pentatonic, `_basePitch = 0.75`)
- Difficulty profiles Easy / Normal / Hard (Classic arcade)

### Adventure battle loop **[V]**
Implemented in `BattleController` on `Adventure_Puzzle`:

1. **Load encounter** → `EncounterConfig` (fallback `Resources.Load("Encounters/gate_drone")` — **asset missing**) or runtime defaults  
2. **Start** → round counter `1`, callouts `WATCH` / `YOUR TURN`  
3. **Round complete** → enemy HP `-= _damagePerHit` (10), enemy pose `hurt` or `defeat`, combo++, callout path to `VICTORY!` if HP ≤ 0  
4. **Pattern fail** → callout `MISS`, hero HP `-= 10`, pose `hurt`/`defeat`, `DEFEATED` if HP ≤ 0  
5. **Post-battle** → wait 3s, log transition (**TODO**: results screen not actually loaded from battle)

### Stubbed / incomplete **[V]**
- `AdventureEncounterManager`: configures from config, then **polls 300s timeout**; completion detection is placeholder  
- `BattleController.TransitionAfterBattle`: does not call `GameFlowManager.OnEncounterComplete` / Results yet  
- Enemy sprites: placeholder silhouettes if enemy art missing  
- No zoom-punch / VS / freeze / KO camera FX wired to Indie Forge presets  
- No battle hit/miss/KO SFX hooks dedicated to Adventure  
- Title **Classic** button explicitly stubbed (`// Classic mode not implemented yet`) even though Classic `Gameplay` stack exists

### Flow around the puzzle **[V]**
`Title` (Adventure) → `Backstory` (3 neon-apocalypse panels) → `Adventure_Walk` (hover-ride to checkpoint) → `Transition` → `Adventure_Puzzle` → (intended) `Results`.

Walk is **side-scrolling hover ride** (`WalkController` / `HoverRide`), **not** a top-down map with NPCs/shops.

---

## 3. Cast, poses, and clips — exist vs still needed

### Indie Forge characters **[V]**
| Character | ID | Role | Style notes | Pose validate |
|-----------|-----|------|-------------|---------------|
| Hero | `974cc4f0-643d-4b5a-a6c5-b7f5e0bb2762` | hero | Flat neon hacker hero on hover-board, same style as `hero_ride` | complete |
| Gate Drone | `a2366477-6dbf-430b-83d3-51acb78e0fb8` | enemy | First Adventure enemy; success slot uses attack pose | complete |

### Poses (approved, 5 each) **[V]**
Slots: `ready`, `success`, `hurt`, `win`, `defeat` for both characters.

**Unity import status **[V]****
| Asset | Unity path | Status |
|-------|------------|--------|
| Hero poses | `Assets/Art/Characters/Hero/Poses/hero_{ready,success,hurt,win,defeat}.png` | Present |
| Hero ride / rig | `hero_ride.png`, `Hacker_Hero_Rig.psb`, Prefabs/Hero | Present (Classic/walk; not battle graphic-novel pipeline) |
| Gate Drone poses | expected `Assets/Art/Characters/Enemies/gate_drone/...` | **Missing** (no Enemies folder) |
| CharacterData / EncounterConfig assets | `Resources/Characters`, `Resources/Encounters` | **Missing** (runtime create + placeholders) |

### Clips **[V]**
| Clip | Character | Moment | Duration | Tags | Status |
|------|-----------|--------|----------|------|--------|
| `ef59207f-…` | Gate Drone | `hit` | 2s | gate-drone, test | Exists |
| `e98b0a86-…` | Gate Drone | `intro` | 2s | gate-drone, test | Exists |

**[K]** Intro described as “intro v2” (black bg, flares, stray beams, weak push-in). CLI only confirms `moment: intro`, 2s, tagged `gate-drone`/`test`.

**Still needed **[V]/[K]****
- Finisher clip  
- Defeat clip  
- Hero clips (any moments)  
- **[I]** Dedicated VS composite may be preset-driven rather than a stored clip; versus **preset** exists, separate VS **clip** does not appear in `clip list`

### Presets (all tagged `gate-drone`) **[V]**
| Type | Params | Tags |
|------|--------|------|
| versus | front, zoom 1, padding 50, Hero left / Gate Drone right | intro |
| zoom_punch | center, **1.15×**, **180 ms**, easeOut | hit |
| flash | `#ffffff`, 200 ms, opacity 0.8 | hit |
| shake | intensity 10, 500 ms, freq 20 | miss |
| freeze | **250 ms** | ko |
| shake | intensity **20**, **700 ms**, freq 25 | ko |

### Battle moment → asset map **[K]** intent vs **[V]** implementation
| Moment | Desired | In Unity now |
|--------|---------|--------------|
| Intro | VS clip + ready poses | Ready poses (Hero art yes / Drone no); intro clip in Forge only; no VS player |
| Playback | Enemy success | Pose API exists; enemy art placeholder |
| Correct | Hero success, enemy hurt, zoom punch, hit clip | HP + pose swap only; no zoom/clip |
| Miss | Hero hurt, enemy success, shake | Hero hurt + MISS callout; PoseSwapper has local flash/shake; no preset FX |
| Win | Finisher clip, enemy defeat, hero win | `VICTORY!` callout + enemy defeat pose path; no finisher; transition TODO |
| Loss | Enemy win, hero defeat | `DEFEATED` + hero defeat pose; transition TODO |
| Sounds | tiles, hit, miss, KO | Tile/synth stack for Classic; battle hit/miss/KO **gap** |

---

## 4. Scenes and screens — exist vs missing

### Present **[V]** (`Assets/Scenes/`)
| Scene | Role |
|-------|------|
| `Title.unity` | Mode entry; Adventure + Classic buttons via `TitleController` |
| `Backstory.unity` | Typewriter panels |
| `Adventure_Walk.unity` | Hover-ride segment to checkpoint |
| `Transition.unity` | Encounter card / handoff |
| `Adventure_Puzzle.unity` | Gate Drone battle + memory board |
| `Adventure_Proto.unity` | Earlier / alternate Adventure prototype scene |
| `Results.unity` | Retry / Title (`ResultsController`) |
| `Gameplay.unity` | Classic Endless Arcade |

### Missing / not built **[V]** / **[I]**
- Top-down overworld map  
- NPC / shop / side-quest screens  
- Mini-game scenes (beyond reusing the memory board inside battle)  
- Dedicated splash/boot scene (icons exist under Addressables; no separate Splash scene)  
- Wired post-battle Results transition from `BattleController`  
- Imported Gate Drone art + EncounterConfig assets in Resources  

---

## 5. Theme and UI — present or gap

| Element | Status | Notes |
|---------|--------|-------|
| Neon / apocalyptic techno theme | **[V]** Present in copy + art direction | Backstory panels; world themes 1–5 backgrounds; cyberpunk music loops |
| App icons / menu art | **[V]** Present | Addressables art: app icons, Easy/Normal/Hard, Endless Arcade, backgrounds |
| Title Adventure button | **[V]** Wired | `StartNewGame()` → Backstory |
| Title Classic button | **[V]** Stub | Log only; Classic play still via `Gameplay` / other entry paths |
| Backstory UI | **[V]** Present | Runtime-built text + Continue/Skip |
| Adventure battle HUD | **[V]** Runtime-built | Portraits, HP, round, combo, WATCH/YOUR TURN/MISS/VICTORY/DEFEATED, pause stub |
| Classic HUD | **[V]** Present, disabled in Adventure | Depth/streak/score; SafeStartCoroutine fix in uncommitted diff |
| Buttons Play/Continue art | **[V]** `Resources/UI/Button_Play.png`, `Button_Continue.png` | |
| Graphic-novel big fighters | **[I]** Partial | Portrait UI sizes ~200×300; not yet MVC zoom stage |
| Safe areas | **[V]** Present | `SafeArea*` scripts used by Title/Battle |

---

## 6. Tuning, stats, and interactions (code values + paths)

### Adventure battle (`Assets/Scripts/Game/Modes/BattleController.cs`) **[V]**
| Field | Value | Notes |
|-------|-------|-------|
| `_heroHP` / `_heroMaxHP` | **100** / **100** | SerializeField |
| `_damagePerHit` | **10** | Private hardcoded (hit and miss) |
| `_maxRounds` | **10** | Display counter; not a hard stop wired to win |
| Enemy HP | From `EncounterConfig.enemyHP` | Fallback load path broken (missing asset) |
| Combo display | Caps visual at **x3** | Increments on round complete |

### Encounter defaults
| Source | sequenceLength | enemyHP | Other |
|--------|----------------|---------|-------|
| `EncounterConfig.cs` script defaults **[V]** | 4 | **0** | `rounds=1`, `difficulty=1`, cyan tints, `enemyId=gate_drone`, displayName `Security Gate` |
| `GameFlowManager` Gate Drone **[V]** | pattern **4** | **20** | Name `Gate Drone` |
| `AdventureEncounterManager` fallback **[V]** | 4 | **30** | Used when no config |
| Sentinel (non-MVP) **[V]** | 6 | 50 | Boss stub |

### Game flow player state (`GameFlowManager.cs`) **[V]**
- `PlayerHP` / `PlayerMaxHP` = 100  
- `PlayerEnergy` = 100  
- `Score` = 0  
- Scenes: Title, Backstory, Adventure_Walk, Transition, Adventure_Puzzle, Results  

### PoseSwapper local FX (`PoseSwapper.cs`) **[V]**
- Flash **0.1 s**, shake magnitude **5**, shake duration **0.15 s**  
- Not the Forge preset values (those are external / unused in Unity yet)

### Classic difficulty profiles (`Assets/ScriptableObjects/DifficultyProfiles/`) **[V]**
| Profile | initialPatternLength | patternLengthIncrement | mistakeTolerance | scoreMultiplier | recallTraceMinPatternLength |
|---------|----------------------|------------------------|------------------|-----------------|-----------------------------|
| Easy | 2 | 1 | **1** | **0.8** | 3 |
| Normal | 2 | 1 | 0 | 1 | 5 |
| Hard | 2 | 1 | 0 | **1.5** | 5 |

Shared: `gridSize: 3`, `playbackSpeedBase: 1`, pause/highlight curves present.

### Scoring (`ScoringConfig_Default.asset`) **[V]**
- `baseScorePerPattern: 100`  
- `depthScoreMultiplier: 10`  
- Streak multipliers: 1.2 / 1.5 / 2 / 3  
- Diff multipliers: Easy 0.8 / Normal 1 / Hard 1.5  

### Walk tuning (`WalkController` / `HoverRide`) **[V]**
- Ride speed **2**, checkpoint distance **10**, groundY **-2**  
- Bob / lean / squash parameters present  

### Uncommitted fixes awaiting retest **[V]**
1. `BattleBootstrap`: disable Classic components with `.enabled = false` (keep GameObjects for shared systems)  
2. `BattleController`: `TextMeshProUGUI` instead of abstract `TMP_Text`; hide duplicate HP bars; auto-start via `GameModeController.StartArcadeRun()`  
3. `HUDController`: `SafeStartCoroutine` when disabled in Adventure  

---

## 7. Audio — present or gap

### Present **[V]**
- World music loops: Neon Circuitry / Cyberpunk / Synth Sunset / Arcade Pulse / Ethereal Arcade  
- Power-up SFX under `Assets/Audio/SFX/PowerUps/`  
- Addressables gameplay SFX: `tile_synth`, `tile_synth2`, `streak_synth`, `bongo_drum_hit`, `congo_block`, `backgroundLoop`, etc.  
- Pitch-mapped tile tones (`AudioPitchMapper`, `_basePitch = 0.75`)  
- Shape “recognized” is primarily a **UI cue** (not a dedicated audio asset found)

### Gap for Gate Drone battle **[V]** / **[K]**
| Need | Status |
|------|--------|
| Tile tones in battle | Likely reuse Classic board audio if board starts correctly |
| Hit SFX | **Missing** as dedicated battle asset |
| Miss SFX | **Missing** |
| KO SFX | **Missing** |
| `Assets/Audio/SFX/TileNotes/` & `UI/` | Empty folders |
| Clip audio (intro/hit) | In Forge MP4s only; not imported/played in Unity |

---

## 8. Keep / cut / invent — beta bible recommendations

### KEEP **[V]**
- Classic Endless Arcade intact (do not couple Adventure progression into Classic worlds)  
- Adventure scene chain and `GameFlowManager` singleton bootstrap  
- Memory board as the only combat verb  
- Indie Forge pose slots (`ready/success/hurt/win/defeat`) matching `CharacterData`  
- Pattern shape library + recognized cue (Classic; optional in battle later)  
- Runtime Battle HUD / Classic UI strip pattern  
- Gate Drone as sole MVP boss  

### CUT / defer from MVP board **[I]**
- Sentinel / multi-encounter chapter  
- Top-down map, shops, NPCs, side quests, mini-games  
- Rig-based hero animation for battle (keep graphic-novel poses + clips)  
- Adventure energy/ability HUD complexity (`AdventureHUD` abilities) until Gate Drone fight feels right  
- Perfect Classic Title button wiring (Classic already playable via Gameplay)  

### INVENT only as MVP glue (not greenfield content) **[I]**
1. Tunable `EncounterConfig` asset for Gate Drone (HP, damage, pattern length, rounds) targeting 60–90 s  
2. Import Gate Drone approved poses into Unity enemy path (or Resources)  
3. Wire moment → pose/clip/preset player (intro / hit / miss / KO)  
4. Battle SFX: hit, miss, KO  
5. Finish win/loss → Results / `CompleteEncounter`  
6. Produce missing clips: finisher, defeat, hero set  
7. Reconcile HP sources (GameFlow 20 vs EncounterManager 30 vs EncounterConfig 0 vs hero 100 / dmg 10)

---

## 9. Proposed MVP board rows (Gate Drone only)

| Item | Type | Status | Source |
|------|------|--------|--------|
| Hero character + 5 approved poses | asset | Done (Forge + Unity PNGs) | Indie Forge / `Assets/Art/Characters/Hero/Poses` |
| Gate Drone character + 5 approved poses | asset | Done in Forge; **not in Unity** | Indie Forge poses; Unity gap |
| Gate Drone intro clip | asset | Done (Forge) | clip `e98b0a86-…` moment `intro` |
| Gate Drone hit clip | asset | Done (Forge) | clip `ef59207f-…` moment `hit` |
| Finisher / defeat / hero clips | asset | **Needed** | Still missing in `clip list` |
| Versus / zoom_punch / flash / shake / freeze presets | asset | Done (Forge) | `preset list` tagged gate-drone |
| EncounterConfig `gate_drone` ScriptableObject | asset | **Needed** | Code expects `Resources/Encounters/gate_drone` |
| CharacterData Resources | asset | **Needed** | Code expects `Resources/Characters/hero` (+ enemy) |
| Adventure_Puzzle scene + BattleController | system | Partial | Present; local fixes untested |
| BattleBootstrap Classic UI strip | system | Partial | Uncommitted `.enabled` fix |
| Memory pattern loop in battle | system | Partial | Auto-start via GMC in uncommitted diff |
| Pose swap on hit/miss/KO | system | Partial | Poses wired; enemy art placeholders |
| Clip + preset playback in battle | system | **Needed** | No Unity VideoPlayer battle wiring |
| HP / damage / pattern length tuning for 60–90 s | system | Stub | Hardcoded 100 HP / 10 dmg; conflicting enemy HP |
| Battle SFX (hit/miss/KO) | asset+system | **Needed** | Not present |
| Win/loss → Results flow | system | **Needed** | 3s wait + TODO log only |
| Title → Backstory → Walk → Puzzle chain | system | Present | Verified scene + controllers |
| Top-down map / shops / NPCs | system | Out of MVP | Not present |
| Classic arcade | system | Keep as-is | `Gameplay.unity` + profiles |

---

## Compact Indie Forge–pasteable YAML

```yaml
# Neon Recall — current-state snapshot
# verified: 2026-11-04 America/Chicago from Unity + forge CLI
# labels: verified | known_context | inferred

game:
  id: game-neon-recall
  name: Neon Recall
  engine: unity
  project_path: ~/Documents/Agencies/1182/Neon_Recall
  branch: feature/adventure-proto
  commit: bc42d64
  platform_intent: iOS  # known_context
  stage: mvp_gate_drone_slice  # verified focus

modes:
  classic:
    status: present  # verified
    scene: Gameplay
    note: Endless Arcade; Title Classic button stubbed
  adventure:
    status: proto_partial  # verified
    scenes: [Title, Backstory, Adventure_Walk, Transition, Adventure_Puzzle, Results]
    mvp_enemy: Gate Drone

mvp:
  goal: perfect Gate Drone battle first  # known_context
  style: marvel_vs_capcom_graphic_novel  # known_context
  presentation: poses_plus_short_clips_no_rig  # known_context
  fight_length_target_sec: [60, 90]  # known_context / inferred target
  uncommitted_awaiting_retest:  # verified
    - Assets/Scripts/Game/Modes/BattleBootstrap.cs
    - Assets/Scripts/Game/Modes/BattleController.cs
    - Assets/Scripts/UI/HUDController.cs

puzzle_core:
  verb: simon_says_memory_board  # verified
  pattern_shapes: [Box, Cross, Diagonal, L-Shape, Line, Reverse L, T-Shape, Zigzag]  # verified
  recognized_cue: true  # verified (ShapeRecognitionManager)
  tile_tones: pitch_mapped_pentatonic  # verified (AudioPitchMapper basePitch 0.75)
  adventure_loop:  # verified
    watch: callout_WATCH
    input: callout_YOUR_TURN
    success: enemy_hp_minus_damage + hurt/defeat pose
    miss: hero_hp_minus_damage + hurt/defeat pose
    win_callout: VICTORY!
    lose_callout: DEFEATED
    post_battle_transition: stub_todo

tuning_verified:
  hero_hp: 100  # BattleController
  hero_max_hp: 100
  damage_per_hit: 10  # hardcoded both sides
  max_rounds_display: 10
  gate_drone_gameflow: { pattern_length: 4, enemy_hp: 20 }
  encounter_config_defaults: { sequence_length: 4, enemy_hp: 0, rounds: 1 }
  adventure_manager_fallback: { sequence_length: 4, enemy_hp: 30 }
  player_energy: 100
  classic_profiles:
    easy: { initial_pattern_length: 2, mistake_tolerance: 1, score_multiplier: 0.8 }
    normal: { initial_pattern_length: 2, mistake_tolerance: 0, score_multiplier: 1.0 }
    hard: { initial_pattern_length: 2, mistake_tolerance: 0, score_multiplier: 1.5 }

cast:
  - id: 974cc4f0-643d-4b5a-a6c5-b7f5e0bb2762
    name: Hero
    role: hero
    poses_approved: [ready, success, hurt, win, defeat]  # verified forge+unity
    unity_art: Assets/Art/Characters/Hero/Poses
    clips: []  # verified none
  - id: a2366477-6dbf-430b-83d3-51acb78e0fb8
    name: Gate Drone
    role: enemy
    poses_approved: [ready, success, hurt, win, defeat]  # verified forge
    unity_art: missing  # verified no Enemies folder
    clips:
      - { id: e98b0a86-1ff5-49d9-af0a-3e7fae8bce7f, moment: intro, duration_sec: 2 }
      - { id: ef59207f-d87d-463b-abcb-7276bb7f9599, moment: hit, duration_sec: 2 }
    clips_needed: [finisher, defeat]  # known_context + verified absent
    hero_clips_needed: true  # known_context + verified absent

presets_gate_drone:  # verified
  - { type: versus, tags: [gate-drone, intro], left: Hero, right: Gate Drone }
  - { type: zoom_punch, zoom: 1.15, duration_ms: 180, tags: [gate-drone, hit] }
  - { type: flash, duration_ms: 200, opacity: 0.8, tags: [gate-drone, hit] }
  - { type: shake, intensity: 10, duration_ms: 500, tags: [gate-drone, miss] }
  - { type: freeze, duration_ms: 250, tags: [gate-drone, ko] }
  - { type: shake, intensity: 20, duration_ms: 700, tags: [gate-drone, ko] }

battle_asset_map:
  intro: { want: [vs_clip_or_versus_preset, ready_poses], unity: partial }
  playback: { want: [enemy_success], unity: stub }
  correct: { want: [hero_success, enemy_hurt, zoom_punch, hit_clip], unity: hp_pose_only }
  miss: { want: [hero_hurt, enemy_success, shake], unity: partial }
  win: { want: [finisher_clip, enemy_defeat, hero_win], unity: callout_only }
  loss: { want: [enemy_win, hero_defeat], unity: callout_only }
  sounds: { want: [tiles, hit, miss, ko], unity: tiles_partial_battle_sfx_gap }

scenes:
  present: [Title, Backstory, Adventure_Walk, Transition, Adventure_Puzzle, Adventure_Proto, Results, Gameplay]
  missing_for_later: [top_down_map, shops, npc_dialogue_hubs, mini_game_shells]

audio:
  present: [world_music_loops, powerup_sfx, addressable_tile_synths, pitch_mapper]
  gap: [battle_hit, battle_miss, battle_ko, tileNotes_folder_empty]

recommendations:
  keep: [classic_untouched, memory_board_combat, forge_pose_slots, gate_drone_only_mvp]
  cut_from_mvp: [sentinel, overworld, shops, npc_quests, ability_energy_complexity]
  invent_as_glue:
    - import_gate_drone_poses_into_unity
    - author_encounterconfig_asset
    - wire_clip_and_preset_playback
    - unify_hp_damage_pattern_tuning_for_60_90s
    - add_battle_sfx
    - finish_results_transition
```

---

### Verification summary
Mac reachable; Unity tree + git + Indie Forge `character` / `pose` / `clip` / `preset` / `validate` / `status` inspected read-only. No exports or mutations run. Values above marked **verified** come from those sources; fight fantasy timing and intro visual flavor marked **known_context** where CLI could not prove appearance.
