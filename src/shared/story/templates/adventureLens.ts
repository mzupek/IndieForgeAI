/**
 * Built-in story template data (Adventure Lens RPG story formula).
 * Game-agnostic: no title names in app modules. Copied into a new game via
 * `forge game create --template adventure-lens`.
 */

import type { StoryTemplate } from '../templates'

export const ADVENTURE_LENS_TEMPLATE: StoryTemplate = {
  key: 'adventure-lens',
  name: 'Adventure Lens RPG story formula',
  builtin: true,
  revealTokenLabel: 'Reveal token',
  flagConventions: {
    naming: 'snake_case <subject>_<state>',
    examples: ['board_offered', 'test_passed', 'fragment_gate', 'stage_twist_won'],
    scopes: {
      game: 'Campaign facts and reveal tokens (bool). Token auto flags are revealed_<tokenKey>.',
      world: 'World-local progress that should not leak across worlds.'
    },
    step6: '<stage>_twist_<outcome> set by the Step 6 encounter onWin / onLose — never a pickup.'
  },
  characterProfileFields: [
    { key: 'summary', label: 'Summary', prompt: 'One or two sentences: who they are in this game.' },
    { key: 'bio', label: 'Bio', prompt: 'What a player (or writer) needs to know about their past.' },
    { key: 'motivation', label: 'Motivation', prompt: 'Why they act, in their own terms.' },
    { key: 'want', label: 'Want (surface)', prompt: 'The surface goal they would name out loud.' },
    { key: 'need', label: 'Need (hidden)', prompt: 'The growth they actually need. Do not spoiler in player-facing copy.' },
    { key: 'arc', label: 'Arc', prompt: 'How they change from You to Change across the campaign or this stage.' },
    { key: 'voiceNotes', label: 'Voice / speech', prompt: 'Register, slang, what they never say.' },
    { key: 'relationships', label: 'Relationships', prompt: 'Other characters (characterId + relation).' },
    { key: 'faction', label: 'Allegiance / faction', prompt: 'Who they stand with, if anyone.' }
  ],
  circleSteps: [
    {
      index: 1,
      label: 'You',
      prompt: 'Establish the hero in their zone of comfort. Who are they before the need?'
    },
    {
      index: 2,
      label: 'Need',
      prompt: 'They want something. Name the surface goal here; keep the hidden goal on the circle.'
    },
    {
      index: 3,
      label: 'Go',
      prompt: 'They enter an unfamiliar situation. Crossing into the stage / world counts.'
    },
    {
      index: 4,
      label: 'Search',
      prompt: 'They adapt, explore, gather. Link scenes, dialogue, and optional encounters.'
    },
    {
      index: 5,
      label: 'Find',
      prompt: 'They get what they wanted (or think they did). Often a reveal token is granted here.'
    },
    {
      index: 6,
      label: 'Take',
      prompt:
        'Pay a heavy price / complication. Stage circles MUST link an encounter in this stage (Step 6 rule).'
    },
    {
      index: 7,
      label: 'Return',
      prompt: 'They return to a familiar situation, changed by the cost.'
    },
    {
      index: 8,
      label: 'Change',
      prompt: 'They have changed. Set a lasting flag. The hidden goal lands here if it lands at all.'
    }
  ],
  surfaceGoalPrompt: 'What the hero (and the player) think this circle is about.',
  hiddenGoalPrompt: 'The real growth / truth under the surface goal. Not a collectible.',
  sampleSkeleton: {
    modules: [{ id: 'story_beat', label: 'Story beat', typeIds: ['story'] }],
    worlds: [{ key: 'world-1', name: 'World 1', order: 0 }],
    stages: [
      {
        key: 'intro',
        name: 'Intro',
        worldId: '@world-1',
        order: 0
      },
      {
        key: 'the_gate',
        name: 'The Gate',
        worldId: '@world-1',
        order: 1,
        unlockAfter: ['@intro']
      }
    ],
    regions: [
      {
        key: 'region-intro-yard',
        name: 'Yard',
        stageId: '@intro',
        anchors: [{ id: 'a-center', label: 'Center', x: 0.5, y: 0.5 }],
        spawn: 'a-center',
        hotspots: [
          {
            id: 'hs-step6',
            kind: 'interact',
            prompt: 'Face the complication',
            pos: [0.6, 0.5],
            encounterId: '@enc-hover-test'
          }
        ]
      }
    ],
    encounters: [
      {
        key: 'enc-hover-test',
        name: 'Intro complication',
        stageId: '@intro',
        typeId: 'story',
        moduleId: 'story_beat'
      },
      {
        key: 'enc-gate-drone',
        name: 'Gate complication',
        stageId: '@the_gate',
        typeId: 'story',
        moduleId: 'story_beat'
      }
    ],
    storyCircles: [
      {
        key: 'circle-campaign',
        name: 'Campaign circle',
        scope: 'game',
        surfaceGoal: '',
        hiddenGoal: '',
        steps: [
          { index: 1, label: 'You', beat: '' },
          { index: 2, label: 'Need', beat: '' },
          { index: 3, label: 'Go', beat: '' },
          { index: 4, label: 'Search', beat: '' },
          { index: 5, label: 'Find', beat: '' },
          { index: 6, label: 'Take', beat: '' },
          { index: 7, label: 'Return', beat: '' },
          { index: 8, label: 'Change', beat: '' }
        ]
      },
      {
        key: 'circle-intro',
        name: 'Intro circle',
        scope: 'stage',
        refId: '@intro',
        surfaceGoal: '',
        hiddenGoal: '',
        steps: [
          { index: 1, label: 'You', beat: '' },
          { index: 2, label: 'Need', beat: '' },
          { index: 3, label: 'Go', beat: '' },
          { index: 4, label: 'Search', beat: '' },
          { index: 5, label: 'Find', beat: '' },
          { index: 6, label: 'Take', beat: '', encounterId: '@enc-hover-test' },
          { index: 7, label: 'Return', beat: '' },
          { index: 8, label: 'Change', beat: '', advancesCircleId: '@circle-campaign', advancesStep: 3 }
        ]
      }
    ]
  }
}
