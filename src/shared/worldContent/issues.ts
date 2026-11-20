export type IssueLevel = 'error' | 'warning'

export interface ContentIssue {
  level: IssueLevel
  path: string
  message: string
}

export interface NamedUser {
  id: string
  name: string
  kind?: string
}

export function errorIssue(path: string, message: string): ContentIssue {
  return { level: 'error', path, message }
}

export function warningIssue(path: string, message: string): ContentIssue {
  return { level: 'warning', path, message }
}

export function formatInUseError(kind: string, key: string, users: NamedUser[]): string {
  const preview = users
    .slice(0, 5)
    .map((u) => `${u.kind ? `${u.kind} ` : ''}${u.name} (${u.id})`)
    .join(', ')
  const extra = users.length > 5 ? ` and ${users.length - 5} more` : ''
  return `Cannot remove ${kind} '${key}': in use by ${users.length} record(s): ${preview}${extra}`
}

export class ContentApplyError extends Error {
  readonly issues: ContentIssue[]
  readonly code = 'CONTENT_APPLY_FAILED'

  constructor(issues: ContentIssue[]) {
    const errors = issues.filter((i) => i.level === 'error')
    super(
      errors.length
        ? `Content apply failed (${errors.length} error(s)): ${errors.map((e) => e.message).join('; ')}`
        : 'Content apply failed'
    )
    this.name = 'ContentApplyError'
    this.issues = issues
  }
}

export function throwIfErrors(issues: ContentIssue[]): void {
  if (issues.some((i) => i.level === 'error')) {
    throw new ContentApplyError(issues)
  }
}

export function errorMessages(issues: ContentIssue[]): string {
  return issues
    .filter((i) => i.level === 'error')
    .map((i) => i.message)
    .join('; ')
}
