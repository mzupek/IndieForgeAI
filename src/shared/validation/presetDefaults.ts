/**
 * Default parameters and validation for scene presets
 * Shared by UI and CLI
 */

import type { ScenePresetType } from '../types/assetPipeline'

export interface VersusParams {
  leftCharacterId?: string
  rightCharacterId?: string
  cameraAngle: 'front' | 'side' | 'low' | 'high'
  zoom: number
  framingPadding: number
}

export interface ZoomPunchParams {
  target: 'left' | 'right' | 'center'
  zoomAmount: number
  durationMs: number
  ease: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
}

export interface ShakeParams {
  intensity: number
  durationMs: number
  frequency: number
}

export interface FlashParams {
  color: string
  durationMs: number
  opacity: number
}

export interface FreezeParams {
  durationMs: number
  holdPoseSlot?: 'ready' | 'success' | 'hurt' | 'win' | 'defeat'
}

export type PresetParams = VersusParams | ZoomPunchParams | ShakeParams | FlashParams | FreezeParams

/**
 * Get default params for a preset type
 */
export function getDefaultParams(type: ScenePresetType): PresetParams {
  switch (type) {
    case 'versus':
      return {
        cameraAngle: 'front',
        zoom: 1.0,
        framingPadding: 50
      }
    case 'zoom_punch':
      return {
        target: 'center',
        zoomAmount: 1.5,
        durationMs: 300,
        ease: 'easeOut'
      }
    case 'shake':
      return {
        intensity: 10,
        durationMs: 500,
        frequency: 20
      }
    case 'flash':
      return {
        color: '#ffffff',
        durationMs: 200,
        opacity: 0.8
      }
    case 'freeze':
      return {
        durationMs: 1000
      }
  }
}

/**
 * Get display name for preset type
 */
export function getPresetTypeDisplayName(type: ScenePresetType): string {
  switch (type) {
    case 'versus':
      return 'Versus Layout'
    case 'zoom_punch':
      return 'Zoom Punch'
    case 'shake':
      return 'Screen Shake'
    case 'flash':
      return 'Flash Effect'
    case 'freeze':
      return 'Freeze Frame'
  }
}

/**
 * Validate preset params (basic type checking)
 */
export function validatePresetParams(type: ScenePresetType, params: Record<string, unknown>): string[] {
  const errors: string[] = []
  
  switch (type) {
    case 'versus': {
      if (params.cameraAngle && !['front', 'side', 'low', 'high'].includes(params.cameraAngle as string)) {
        errors.push('cameraAngle must be front, side, low, or high')
      }
      if (params.zoom !== undefined && (typeof params.zoom !== 'number' || params.zoom <= 0)) {
        errors.push('zoom must be a positive number')
      }
      if (params.framingPadding !== undefined && typeof params.framingPadding !== 'number') {
        errors.push('framingPadding must be a number')
      }
      break
    }
    case 'zoom_punch': {
      if (params.target && !['left', 'right', 'center'].includes(params.target as string)) {
        errors.push('target must be left, right, or center')
      }
      if (params.zoomAmount !== undefined && (typeof params.zoomAmount !== 'number' || params.zoomAmount <= 0)) {
        errors.push('zoomAmount must be a positive number')
      }
      if (params.durationMs !== undefined && (typeof params.durationMs !== 'number' || params.durationMs <= 0)) {
        errors.push('durationMs must be a positive number')
      }
      if (params.ease && !['linear', 'easeIn', 'easeOut', 'easeInOut'].includes(params.ease as string)) {
        errors.push('ease must be linear, easeIn, easeOut, or easeInOut')
      }
      break
    }
    case 'shake': {
      if (params.intensity !== undefined && (typeof params.intensity !== 'number' || params.intensity <= 0)) {
        errors.push('intensity must be a positive number')
      }
      if (params.durationMs !== undefined && (typeof params.durationMs !== 'number' || params.durationMs <= 0)) {
        errors.push('durationMs must be a positive number')
      }
      if (params.frequency !== undefined && (typeof params.frequency !== 'number' || params.frequency <= 0)) {
        errors.push('frequency must be a positive number')
      }
      break
    }
    case 'flash': {
      if (params.color !== undefined && typeof params.color !== 'string') {
        errors.push('color must be a string (hex color)')
      }
      if (params.durationMs !== undefined && (typeof params.durationMs !== 'number' || params.durationMs <= 0)) {
        errors.push('durationMs must be a positive number')
      }
      if (params.opacity !== undefined && (typeof params.opacity !== 'number' || params.opacity < 0 || params.opacity > 1)) {
        errors.push('opacity must be a number between 0 and 1')
      }
      break
    }
    case 'freeze': {
      if (params.durationMs !== undefined && (typeof params.durationMs !== 'number' || params.durationMs <= 0)) {
        errors.push('durationMs must be a positive number')
      }
      if (params.holdPoseSlot && !['ready', 'success', 'hurt', 'win', 'defeat'].includes(params.holdPoseSlot as string)) {
        errors.push('holdPoseSlot must be ready, success, hurt, win, or defeat')
      }
      break
    }
  }
  
  return errors
}
