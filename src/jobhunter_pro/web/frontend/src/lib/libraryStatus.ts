/** 手动流水线（岗位库/台账）状态标签与配色。 */

export const LIBRARY_JOB_STATUSES = ['new', 'matched', 'interested', 'applied', 'interview', 'offer', 'rejected'] as const

export const LIBRARY_JOB_STATUS_LABELS: Record<string, string> = {
  new: '新岗位',
  matched: '匹配可投',
  interested: '有意向',
  applied: '已投递',
  interview: '面试中',
  offer: 'Offer',
  rejected: '已排除',
}

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  drafted: '草稿',
  submitted: '已投递',
  replied: '已回复',
  interview: '面试中',
  offer: 'Offer',
  rejected: '已拒绝',
}

/** Badge 配色：-soft 背景 + 边框 + 文字。 */
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  new: { bg: 'bg-info-soft border-info-border', text: 'text-info' },
  matched: { bg: 'bg-success-soft border-success-border', text: 'text-success' },
  interested: { bg: 'bg-cyan-soft border-cyan-border', text: 'text-cyan' },
  applied: { bg: 'bg-primary-soft border-primary-border', text: 'text-primary' },
  interview: { bg: 'bg-purple-soft border-purple-border', text: 'text-purple' },
  offer: { bg: 'bg-star-soft border-star-border', text: 'text-star' },
  rejected: { bg: 'bg-danger-soft border-danger-border', text: 'text-danger' },
  drafted: { bg: 'bg-surface-muted border-card-border', text: 'text-muted' },
  submitted: { bg: 'bg-primary-soft border-primary-border', text: 'text-primary' },
  replied: { bg: 'bg-info-soft border-info-border', text: 'text-info' },
}

export function libraryStatusClass(status: string | null | undefined): string {
  const color = STATUS_COLOR[status ?? ''] ?? STATUS_COLOR.new
  return `border ${color.bg} ${color.text}`
}
