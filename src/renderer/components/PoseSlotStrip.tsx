import { useState } from 'react'
import { useLocalFilePreview } from '../hooks/useLocalFilePreview'
import type { Pose, PoseSlot, Character } from '@shared/types/assetPipeline'
import { POSE_SLOTS, checkPoseCompleteness, formatValidationIssues } from '@shared/poseValidation'
import type { PoseMetadata } from '@shared/poseValidation'

interface PoseSlotStripProps {
  character: Character
  poses: Pose[]
  poseMetadata?: Record<string, PoseMetadata>
  size?: 'small' | 'large'
  onSlotClick?: (slot: PoseSlot) => void
  showBadge?: boolean
}

export function PoseSlotStrip({
  character,
  poses,
  poseMetadata,
  size = 'small',
  onSlotClick,
  showBadge = false
}: PoseSlotStripProps) {
  const [showIssues, setShowIssues] = useState(false)
  
  const slotSize = size === 'small' ? 48 : 128
  const characterPoses = poses.filter((p) => p.characterId === character.id)

  // Build metadata map
  const metadataMap = new Map<string, PoseMetadata>()
  if (poseMetadata) {
    Object.entries(poseMetadata).forEach(([id, meta]) => {
      metadataMap.set(id, meta)
    })
  }

  const completeness = checkPoseCompleteness(character, poses, metadataMap)

  return (
    <div>
      <div style={{ display: 'flex', gap: size === 'small' ? '0.5rem' : '1rem', alignItems: 'flex-start' }}>
        {POSE_SLOTS.map((slot) => {
          const pose = characterPoses.find((p) => p.slot === slot)
          return (
            <PoseSlot
              key={slot}
              slot={slot}
              pose={pose}
              size={slotSize}
              onClick={onSlotClick ? () => onSlotClick(slot) : undefined}
            />
          )
        })}
        
        {showBadge && (
          <CompletenessBadge
            complete={completeness.complete}
            issues={completeness.issues}
            onClick={() => setShowIssues(!showIssues)}
          />
        )}
      </div>

      {showBadge && showIssues && !completeness.complete && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.75rem',
          background: 'var(--bg)',
          border: '1px solid var(--error)',
          borderRadius: '4px',
          fontSize: '0.85rem'
        }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 'bold', color: 'var(--error)' }}>
            Validation Issues:
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
            {completeness.issues.map((issue, i) => (
              <li key={i} style={{ color: 'var(--muted)' }}>
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PoseSlot({
  slot,
  pose,
  size,
  onClick
}: {
  slot: PoseSlot
  pose?: Pose
  size: number
  onClick?: () => void
}) {
  const thumbnail = useLocalFilePreview(pose?.file)

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        border: pose ? '1px solid var(--border)' : '1px dashed var(--border)',
        borderRadius: '4px',
        overflow: 'hidden',
        background: pose ? 'var(--bg)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
        position: 'relative'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick && pose) {
          e.currentTarget.style.borderColor = 'var(--forge-gold)'
          e.currentTarget.style.transform = 'scale(1.05)'
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.transform = 'scale(1)'
        }
      }}
      title={slot}
    >
      {thumbnail ? (
        <img
          src={thumbnail}
          alt={`${slot} pose`}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <span style={{ fontSize: size > 64 ? '0.9rem' : '0.7rem', color: 'var(--muted)', textAlign: 'center', lineHeight: '1.1' }}>
          {size > 64 ? slot : slot.slice(0, 3)}
        </span>
      )}
      
      {pose && pose.status !== 'approved' && (
        <div style={{
          position: 'absolute',
          top: '2px',
          right: '2px',
          padding: '0.125rem 0.25rem',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          fontSize: '0.6rem',
          color: 'var(--muted)'
        }}>
          {pose.status}
        </div>
      )}
    </div>
  )
}

function CompletenessBadge({
  complete,
  issues,
  onClick
}: {
  complete: boolean
  issues: any[]
  onClick: () => void
}) {
  if (complete) {
    return (
      <div style={{
        padding: '0.5rem 0.75rem',
        background: 'var(--success-bg, #1a3a1a)',
        border: '1px solid var(--success, #4caf50)',
        borderRadius: '4px',
        fontSize: '0.85rem',
        color: 'var(--success, #4caf50)',
        fontWeight: 'bold',
        whiteSpace: 'nowrap'
      }}>
        ✓ Complete
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '0.5rem 0.75rem',
        background: 'var(--error-bg, #3a1a1a)',
        border: '1px solid var(--error)',
        borderRadius: '4px',
        fontSize: '0.85rem',
        color: 'var(--error)',
        fontWeight: 'bold',
        cursor: 'pointer',
        transition: 'opacity 0.2s',
        whiteSpace: 'nowrap'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '0.8'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '1'
      }}
    >
      ✗ {issues.length} issue{issues.length !== 1 ? 's' : ''}
    </div>
  )
}
