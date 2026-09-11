/**
 * Deterministic part-sheet layout for AI cutout kits.
 * Slots are fixed — no vision parsing; crop by known rects after generation.
 */

import type { MotionVec2, PuppetPartId } from '@shared/types/project'
import { RH_BATTER_PUPPET_PART_IDS } from './characterPuppet'

export const PART_SHEET_SIZE = 1024
export const PART_SHEET_COLS = 4
export const PART_SHEET_ROWS = 2

export interface PartSheetSlot {
  partId: PuppetPartId
  label: string
  /** Cell origin on the sheet */
  x: number
  y: number
  width: number
  height: number
  /** Pivot inside the cell (part-local after extract = same if no trim) */
  pivotInCell: MotionVec2
}

const PART_LABELS: Record<PuppetPartId, string> = {
  farLeg: 'Far leg',
  nearLeg: 'Near leg',
  torso: 'Torso',
  farArm: 'Far arm',
  nearArm: 'Near arm',
  hands: 'Hands',
  bat: 'Bat',
  head: 'Head'
}

/** Bind-joint placement inside each slot (fractions of cell). */
const PIVOT_FRAC: Record<PuppetPartId, MotionVec2> = {
  head: { x: 0.5, y: 0.5 },
  torso: { x: 0.5, y: 0.55 },
  farArm: { x: 0.4, y: 0.28 },
  nearArm: { x: 0.4, y: 0.28 },
  farLeg: { x: 0.5, y: 0.85 },
  nearLeg: { x: 0.5, y: 0.85 },
  hands: { x: 0.5, y: 0.5 },
  bat: { x: 0.72, y: 0.55 },
}

export function getPartSheetSlots(
  partIds: PuppetPartId[] = RH_BATTER_PUPPET_PART_IDS
): PartSheetSlot[] {
  const cellW = PART_SHEET_SIZE / PART_SHEET_COLS
  const cellH = PART_SHEET_SIZE / PART_SHEET_ROWS
  return partIds.map((partId, index) => {
    const col = index % PART_SHEET_COLS
    const row = Math.floor(index / PART_SHEET_COLS)
    const frac = PIVOT_FRAC[partId] ?? { x: 0.5, y: 0.5 }
    return {
      partId,
      label: PART_LABELS[partId] ?? partId,
      x: Math.round(col * cellW),
      y: Math.round(row * cellH),
      width: Math.round(cellW),
      height: Math.round(cellH),
      pivotInCell: {
        x: cellW * frac.x,
        y: cellH * frac.y
      }
    }
  })
}

/** SVG overlay: labeled empty slots for the AI part-sheet edit. */
export function buildPartSheetTemplateSvg(): string {
  const slots = getPartSheetSlots()
  const cells = slots
    .map((s) => {
      const cx = s.x + s.width / 2
      const cy = s.y + 28
      const px = s.x + s.pivotInCell.x
      const py = s.y + s.pivotInCell.y
      return `
      <rect x="${s.x + 4}" y="${s.y + 4}" width="${s.width - 8}" height="${s.height - 8}"
        fill="none" stroke="#88aacc" stroke-width="3" stroke-dasharray="10 6" rx="8"/>
      <text x="${cx}" y="${cy}" fill="#cfe0f5" font-size="22" font-family="monospace"
        text-anchor="middle">${escapeXml(s.label)}</text>
      <text x="${cx}" y="${cy + 22}" fill="#8aa0b8" font-size="14" font-family="monospace"
        text-anchor="middle">${escapeXml(s.partId)}</text>
      <circle cx="${px}" cy="${py}" r="6" fill="#ff6644" stroke="#fff" stroke-width="2"/>
      <text x="${px + 10}" y="${py + 4}" fill="#ff8866" font-size="12" font-family="monospace">pivot</text>
    `
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PART_SHEET_SIZE}" height="${PART_SHEET_SIZE}"
  viewBox="0 0 ${PART_SHEET_SIZE} ${PART_SHEET_SIZE}">
  <rect width="100%" height="100%" fill="#12161c"/>
  ${cells}
</svg>`
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
