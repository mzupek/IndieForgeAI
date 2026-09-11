import type { MotionJoint, MotionJointId, MotionPhase, MotionVec2 } from '@shared/types/project'
import { AT_BAT_ANCHORS, BONE_EDGES, applyRootOffset } from '@shared/motion/rhBatterSwing'

export type PoseGuideViewMode = 'skeleton' | 'mannequin'

export type CraftOverlayMode = 'off' | 'guide' | 'silhouette' | 'outline' | 'both'

export interface PoseGuideRenderOptions {
  width: number
  height: number
  phase: MotionPhase
  /** Ghost adjacent phases (onion skin) */
  onionPhases?: MotionPhase[]
  viewMode?: PoseGuideViewMode
  showAnchors?: boolean
  background?: string
  /** Draw joint hit targets larger for editing */
  editMode?: boolean
  highlightJointId?: MotionJointId | null
  /**
   * Optional Craft silhouette / outline image(s) drawn under the rig for alignment.
   * Do not include these when exporting the AI pose-guide PNG.
   */
  craftOverlay?: {
    guide?: CanvasImageSource | null
    silhouette?: CanvasImageSource | null
    outline?: CanvasImageSource | null
    mode?: CraftOverlayMode
    opacity?: number
  }
}

function worldJoints(phase: MotionPhase): MotionJoint[] {
  return applyRootOffset(phase.joints, phase.rootOffset)
}

function drawAnchors(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  for (const a of AT_BAT_ANCHORS) {
    ctx.save()
    if (a.kind === 'box' && a.w != null && a.h != null) {
      const x = a.x * width
      const y = a.y * height
      const w = a.w * width
      const h = a.h * height
      ctx.strokeStyle = 'rgba(255, 200, 80, 0.55)'
      ctx.fillStyle = 'rgba(255, 200, 80, 0.08)'
      ctx.lineWidth = Math.max(1, width / 512)
      ctx.setLineDash([6, 4])
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(255, 220, 140, 0.85)'
      ctx.font = `${Math.max(10, width / 64)}px sans-serif`
      ctx.fillText(a.label, x + 4, y + Math.max(12, height / 64))
    } else if (a.kind === 'arrow' && a.tipX != null && a.tipY != null) {
      const x0 = a.x * width
      const y0 = a.y * height
      const x1 = a.tipX * width
      const y1 = a.tipY * height
      ctx.strokeStyle = 'rgba(120, 200, 255, 0.7)'
      ctx.fillStyle = 'rgba(120, 200, 255, 0.7)'
      ctx.lineWidth = Math.max(2, width / 256)
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
      const ang = Math.atan2(y1 - y0, x1 - x0)
      const ah = Math.max(8, width / 64)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x1 - ah * Math.cos(ang - 0.4), y1 - ah * Math.sin(ang - 0.4))
      ctx.lineTo(x1 - ah * Math.cos(ang + 0.4), y1 - ah * Math.sin(ang + 0.4))
      ctx.closePath()
      ctx.fill()
      ctx.font = `${Math.max(10, width / 64)}px sans-serif`
      ctx.fillText(a.label, x1 + 6, y1 + 4)
    }
    ctx.restore()
  }
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  joints: MotionJoint[],
  opts: {
    boneColor: string
    jointColor: string
    batColor: string
    alpha?: number
    mannequin?: boolean
    editMode?: boolean
    highlightJointId?: MotionJointId | null
    width: number
  }
): void {
  const alpha = opts.alpha ?? 1
  ctx.save()
  ctx.globalAlpha = alpha

  const map = new Map(joints.map((j) => [j.id, j]))

  if (opts.mannequin) {
    const hips = map.get('hips')
    const shoulders = map.get('shoulders')
    const head = map.get('head')
    const torso = map.get('torso')
    if (hips && shoulders && torso) {
      ctx.fillStyle = 'rgba(90, 110, 140, 0.55)'
      const bw = opts.width * 0.06
      ctx.beginPath()
      ctx.ellipse(torso.x, torso.y, bw, Math.hypot(shoulders.y - hips.y, shoulders.x - hips.x) * 0.45, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (head) {
      ctx.fillStyle = 'rgba(110, 130, 160, 0.7)'
      ctx.beginPath()
      ctx.arc(head.x, head.y, opts.width * 0.035, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const [a, b] of BONE_EDGES) {
    const ja = map.get(a)
    const jb = map.get(b)
    if (!ja || !jb) continue
    const isBat = a === 'batHandle' || b === 'batTip' || a === 'hands'
    ctx.strokeStyle = isBat && (a === 'batHandle' || b === 'batTip') ? opts.batColor : opts.boneColor
    ctx.lineWidth =
      a === 'batHandle' || b === 'batTip'
        ? Math.max(3, opts.width / 180)
        : Math.max(2, opts.width / 220)
    ctx.beginPath()
    ctx.moveTo(ja.x, ja.y)
    ctx.lineTo(jb.x, jb.y)
    ctx.stroke()
  }

  const r = opts.editMode ? Math.max(6, opts.width / 90) : Math.max(4, opts.width / 120)
  for (const j of joints) {
    const hi = opts.highlightJointId === j.id
    ctx.fillStyle = hi ? '#ff8c00' : opts.jointColor
    ctx.strokeStyle = hi ? '#fff' : 'rgba(0,0,0,0.35)'
    ctx.lineWidth = hi ? 2 : 1
    ctx.beginPath()
    ctx.arc(j.x, j.y, hi ? r * 1.25 : r, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  ctx.restore()
}

/** Draw a pose guide into an existing 2D context (design-resolution pixels). */
export function drawPoseGuide(
  ctx: CanvasRenderingContext2D,
  options: PoseGuideRenderOptions
): void {
  const {
    width,
    height,
    phase,
    onionPhases = [],
    viewMode = 'skeleton',
    showAnchors = true,
    background = '#1a1f2a',
    editMode = false,
    highlightJointId = null,
    craftOverlay
  } = options

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  if (showAnchors) drawAnchors(ctx, width, height)

  const mode = craftOverlay?.mode ?? 'off'
  const opacity = Math.max(0, Math.min(1, craftOverlay?.opacity ?? 0.45))
  if (mode !== 'off' && craftOverlay) {
    ctx.save()
    ctx.globalAlpha = opacity
    const drawFit = (img: CanvasImageSource | null | undefined) => {
      if (!img) return
      // Contain within canvas (Craft is usually same design size)
      const iw =
        'naturalWidth' in img && (img as HTMLImageElement).naturalWidth
          ? (img as HTMLImageElement).naturalWidth
          : width
      const ih =
        'naturalHeight' in img && (img as HTMLImageElement).naturalHeight
          ? (img as HTMLImageElement).naturalHeight
          : height
      const scale = Math.min(width / Math.max(1, iw), height / Math.max(1, ih))
      const dw = iw * scale
      const dh = ih * scale
      const dx = (width - dw) / 2
      const dy = (height - dh) / 2
      ctx.drawImage(img, dx, dy, dw, dh)
    }
    if (mode === 'guide') drawFit(craftOverlay.guide)
    if (mode === 'silhouette' || mode === 'both') drawFit(craftOverlay.silhouette)
    if (mode === 'outline' || mode === 'both') drawFit(craftOverlay.outline)
    ctx.restore()
  }

  for (const onion of onionPhases) {
    drawSkeleton(ctx, worldJoints(onion), {
      boneColor: 'rgba(180, 180, 200, 0.35)',
      jointColor: 'rgba(180, 180, 200, 0.4)',
      batColor: 'rgba(200, 160, 100, 0.35)',
      alpha: 0.45,
      mannequin: viewMode === 'mannequin',
      width
    })
  }

  drawSkeleton(ctx, worldJoints(phase), {
    boneColor: '#e8eef8',
    jointColor: '#7eb6ff',
    batColor: '#d4a574',
    mannequin: viewMode === 'mannequin',
    editMode,
    highlightJointId,
    width
  })

  // Phase label
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.font = `bold ${Math.max(14, width / 48)}px sans-serif`
  ctx.fillText(phase.name.replace(/_/g, ' '), 16, 28)
}

export function renderPoseGuideToCanvas(
  canvas: HTMLCanvasElement,
  options: PoseGuideRenderOptions
): void {
  canvas.width = options.width
  canvas.height = options.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  drawPoseGuide(ctx, options)
}

/** Draw a skeleton from already-world joints (puppet timeline samples). */
export interface JointsPoseGuideOptions {
  width: number
  height: number
  joints: MotionJoint[]
  label: string
  /** Ghost previous/next key joints */
  onionJoints?: MotionJoint[]
  showAnchors?: boolean
  background?: string
  subtitle?: string
}

export function drawJointsPoseGuide(
  ctx: CanvasRenderingContext2D,
  options: JointsPoseGuideOptions
): void {
  const {
    width,
    height,
    joints,
    label,
    onionJoints,
    showAnchors = true,
    background = '#1a1f2a',
    subtitle
  } = options

  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  if (showAnchors) drawAnchors(ctx, width, height)

  if (onionJoints?.length) {
    drawSkeleton(ctx, onionJoints, {
      boneColor: 'rgba(180, 180, 200, 0.3)',
      jointColor: 'rgba(180, 180, 200, 0.35)',
      batColor: 'rgba(200, 160, 100, 0.3)',
      alpha: 0.4,
      width
    })
  }

  drawSkeleton(ctx, joints, {
    boneColor: '#e8eef8',
    jointColor: '#7eb6ff',
    batColor: '#d4a574',
    width
  })

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `bold ${Math.max(14, width / 48)}px sans-serif`
  ctx.fillText(label, 16, 28)
  if (subtitle) {
    ctx.fillStyle = 'rgba(180, 200, 230, 0.75)'
    ctx.font = `${Math.max(11, width / 56)}px sans-serif`
    ctx.fillText(subtitle, 16, 28 + Math.max(16, width / 40))
  }
}

export function renderJointsPoseGuideToCanvas(
  canvas: HTMLCanvasElement,
  options: JointsPoseGuideOptions
): void {
  canvas.width = options.width
  canvas.height = options.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  drawJointsPoseGuide(ctx, options)
}

export function hitTestJoint(
  phase: MotionPhase,
  canvasX: number,
  canvasY: number,
  hitRadius: number
): MotionJointId | null {
  const joints = worldJoints(phase)
  let best: MotionJointId | null = null
  let bestDist = hitRadius
  for (const j of joints) {
    const d = Math.hypot(j.x - canvasX, j.y - canvasY)
    if (d <= bestDist) {
      bestDist = d
      best = j.id
    }
  }
  return best
}

export function moveJoint(
  phase: MotionPhase,
  jointId: MotionJointId,
  canvasX: number,
  canvasY: number
): MotionPhase {
  const root: MotionVec2 = phase.rootOffset
  return {
    ...phase,
    joints: phase.joints.map((j) =>
      j.id === jointId ? { ...j, x: canvasX - root.x, y: canvasY - root.y } : j
    )
  }
}

export function duplicatePhaseJoints(from: MotionPhase, onto: MotionPhase): MotionPhase {
  return {
    ...onto,
    rootOffset: { ...from.rootOffset },
    joints: from.joints.map((j) => ({ ...j }))
  }
}

export function ensureAllJoints(phase: MotionPhase, template: MotionPhase): MotionPhase {
  const have = new Set(phase.joints.map((j) => j.id))
  const missing = template.joints.filter((j) => !have.has(j.id))
  if (!missing.length) return phase
  return { ...phase, joints: [...phase.joints, ...missing.map((j) => ({ ...j }))] }
}
