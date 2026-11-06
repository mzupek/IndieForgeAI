/**
 * P0 contract notes for pose events.
 *
 * Production EventDefinition / EventBinding / EventBindingAction live in
 * assetPipeline.ts (merged for P3). This file re-exports those types so
 * older contract references keep compiling. Preview dispatch is
 * src/shared/storyboard/eventPreview.ts. P4 timed pose/state keys are
 * not implemented here.
 */

export type {
  EventBinding,
  EventBindingAction,
  EventDefinition,
  EventPayloadSchema,
  EventReturnPolicy
} from './assetPipeline'

export {
  applyLayerPreview,
  computeEffectiveLayerState
} from '../storyboard/eventPreview'
export type {
  EventPreviewSnapshot,
  PreviewLayerOverride
} from '../storyboard/eventPreview'
