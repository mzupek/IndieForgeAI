/**
 * SVG Motion Blueprint skeleton frames for Aseprite export (no DOM canvas).
 * Matches the thin joint/bone look from Motion Studio pose guides.
 */

import type { MotionJoint, MotionJointId } from '@shared/types/project'
import { AT_BAT_ANCHORS, BONE_EDGES } from './rhBatterSwing'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function jointMap(joints: MotionJoint[]): Map<MotionJointId, MotionJoint> {
  return new Map(joints.map((j) => [j.id, j]))
}

/** Dark blueprint plate + thin skeleton + optional field anchors. */
export function buildSkeletonFrameSvg(options: {
  width: number
  height: number
  joints: MotionJoint[]
  label: string
  subtitle?: string
  showAnchors?: boolean
  /** Transparent background for onion-skin over the guide in Aseprite */
  transparent?: boolean
}): string {
  const {
    width,
    height,
    joints,
    label,
    subtitle,
    showAnchors = true,
    transparent = false
  } = options
  const map = jointMap(joints)
  const lw = Math.max(2, width / 220)
  const batLw = Math.max(3, width / 180)
  const jr = Math.max(4, width / 120)
  const font = Math.max(11, width / 48)

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
  )
  if (!transparent) {
    parts.push(`<rect width="100%" height="100%" fill="#1a1f2a"/>`)
  }

  if (showAnchors) {
    for (const a of AT_BAT_ANCHORS) {
      if (a.kind === 'box' && a.w != null && a.h != null) {
        const x = a.x * width
        const y = a.y * height
        const w = a.w * width
        const h = a.h * height
        parts.push(
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(255,200,80,0.08)" stroke="rgba(255,200,80,0.55)" stroke-width="${Math.max(1, width / 512)}" stroke-dasharray="6 4"/>`
        )
        parts.push(
          `<text x="${x + 4}" y="${y + Math.max(12, height / 64)}" fill="rgba(255,220,140,0.85)" font-size="${Math.max(10, width / 64)}" font-family="sans-serif">${esc(a.label)}</text>`
        )
      } else if (a.kind === 'arrow' && a.tipX != null && a.tipY != null) {
        const x0 = a.x * width
        const y0 = a.y * height
        const x1 = a.tipX * width
        const y1 = a.tipY * height
        parts.push(
          `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="rgba(120,200,255,0.7)" stroke-width="${Math.max(2, width / 256)}" stroke-linecap="round"/>`
        )
        parts.push(
          `<text x="${x1 + 6}" y="${y1 + 4}" fill="rgba(120,200,255,0.85)" font-size="${Math.max(10, width / 64)}" font-family="sans-serif">${esc(a.label)}</text>`
        )
      }
    }
  }

  for (const [a, b] of BONE_EDGES) {
    const ja = map.get(a)
    const jb = map.get(b)
    if (!ja || !jb) continue
    const isBat = a === 'batHandle' || b === 'batTip'
    const stroke = isBat ? '#d4a574' : '#e8eef8'
    const widthStroke = isBat ? batLw : lw
    parts.push(
      `<line x1="${ja.x}" y1="${ja.y}" x2="${jb.x}" y2="${jb.y}" stroke="${stroke}" stroke-width="${widthStroke}" stroke-linecap="round"/>`
    )
  }

  for (const j of joints) {
    parts.push(
      `<circle cx="${j.x}" cy="${j.y}" r="${jr}" fill="#7eb6ff" stroke="rgba(0,0,0,0.35)" stroke-width="1"/>`
    )
  }

  parts.push(
    `<text x="12" y="${font + 8}" fill="rgba(255,255,255,0.9)" font-size="${font}" font-weight="700" font-family="sans-serif">${esc(label)}</text>`
  )
  if (subtitle) {
    parts.push(
      `<text x="12" y="${font * 2 + 14}" fill="rgba(200,210,220,0.75)" font-size="${Math.max(10, font * 0.7)}" font-family="sans-serif">${esc(subtitle)}</text>`
    )
  }

  parts.push(`</svg>`)
  return parts.join('')
}
