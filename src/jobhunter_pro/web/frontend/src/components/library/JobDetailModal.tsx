import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Trash2,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { copyToClipboard } from '@/lib/clipboard'
import { getStatusLabel } from '@/lib/status'
import {
  APPLICATION_STATUS_LABELS,
  LIBRARY_JOB_STATUSES,
  LIBRARY_JOB_STATUS_LABELS,
  libraryStatusClass,
} from '@/lib/libraryStatus'
import { cn } from '@/lib/utils'

interface LibraryJdJson {
  title?: string
  company?: string
  city?: string
  salary_min?: number | null
  salary_max?: number | null
  salary_note?: string
  years_required?: string
  education_required?: string
  company_nature?: string
  company_size_people?: number | null
  responsibilities?: string[]
  must_have?: string[]
  nice_to_have?: string[]
  skill_points?: { name?: string; category?: string; level?: string }[]
  red_flags?: string[]
  [key: string]: unknown
}

interface LibraryApplication {
  status: string
  resume_file: string
  greeting_file: string
  cover_letter_file: string
  submitted_at: string | null
  notes: string
}

export interface LibraryJobDetail {
  id: string
  title: string
  company: string
  salary: string
  city: string
  experience: string
  education: string
  url: string
  jd: string
  jd_json: LibraryJdJson
  score: number
  score_reason: string
  greeting: string
  status: string
  source_platform: string
  role_type: string
  salary_min: number | null
  salary_max: number | null
  salary_note: string
  years_required: string
  education_required: string
  red_flags: string
  missing_skills: string[]
  reject_reason: string
  created_at: string
  updated_at: string
  application: LibraryApplication | null
  greeting_file: string
  cover_letter_file: string
  resume_file: string
}

interface JobDetailModalProps {
  open: boolean
  jobId: string | null
  onClose: () => void
  onChanged?: () => void
  onSoftDelete?: () => void
}

type Feedback = { type: 'success' | 'error'; text: string }
type BusyAction =
  | 'process'
  | 'prep'
  | 'prep-force'
  | 'pdf'
  | 'role'
  | 'app-status'
  | 'app-note'
  | 'job-status'
  | null

const JOB_STATUS_HINTS: Record<string, string> = {
  new: '新岗位，等待评分或人工判断是否值得投递。',
  matched: '评分已达到门槛，可优先安排投递。',
  interested: '已确认投递意向，建议先生成定制材料。',
  applied: '标记为已投递，投递台账会同步为「已投递」。',
  interview: '进入面试阶段，投递台账会同步为「面试中」，可用面试准备包备面。',
  offer: '已拿到 Offer，投递台账会同步为「Offer」。',
  rejected: '已排除该岗位，投递台账会同步为「已拒绝」。',
}

function isHttpUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function isManualDetail(job: LibraryJobDetail | null): boolean {
  return job?.source_platform === 'manual'
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, note?: string): string {
  const format = (value: number) => {
    if (value >= 1000) {
      const k = value / 1000
      return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}K`
    }
    return String(Math.round(value))
  }
  let range = ''
  if (min != null && max != null) range = `${format(min)}-${format(max)}`
  else if (min != null) range = `${format(min)} 起`
  else if (max != null) range = `最高 ${format(max)}`
  return [range, note].filter(Boolean).join(' · ') || '面议'
}

function scoreClass(score: number | null | undefined): string {
  if (score == null) return 'text-muted'
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-primary'
  return 'text-danger'
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        if (item && typeof item === 'object') {
          const name = (item as { name?: unknown }).name
          if (typeof name === 'string') return name
        }
        return ''
      })
      .map((item) => item.trim())
      .filter(Boolean)
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function InfoItem({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-foreground">{value}</dd>
    </div>
  )
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5 text-foreground">
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function TextChipList({
  title,
  items,
  tone = 'default',
}: {
  title: string
  items: string[]
  tone?: 'default' | 'danger' | 'warning'
}) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px]',
              tone === 'danger'
                ? 'border-danger-border bg-danger-soft text-danger'
                : tone === 'warning'
                  ? 'border-warning-border bg-warning-soft text-warning'
                  : 'border-card-border bg-secondary text-foreground',
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

function MaterialView({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
  if (!text) {
    return (
      <p className="rounded-lg border border-dashed border-card-border bg-surface px-3 py-6 text-center text-xs text-muted">
        尚未生成该材料，可点击上方「重新评分+定制」生成。
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">共 {text.length} 个字符</span>
        <Button type="button" size="sm" variant="secondary" onClick={onCopy}>
          {copied ? (
            <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-card-border bg-surface p-3 text-xs leading-6 text-foreground">
        {text}
      </div>
    </div>
  )
}

export function JobDetailModal({ open, jobId, onClose, onChanged, onSoftDelete }: JobDetailModalProps) {
  const [job, setJob] = useState<LibraryJobDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [roleDraft, setRoleDraft] = useState('')
  const [appStatus, setAppStatus] = useState('')
  const [appNote, setAppNote] = useState('')
  const [jobStatus, setJobStatus] = useState('new')
  const [copiedKey, setCopiedKey] = useState('')
  const [prepResult, setPrepResult] = useState<{ content: string; path: string; cached: boolean } | null>(null)
  const [pdfPath, setPdfPath] = useState('')
  const [greetingDraft, setGreetingDraft] = useState('')
  const [greetingBusy, setGreetingBusy] = useState(false)
  const [traceData, setTraceData] = useState<{ state: string; trace?: Record<string, unknown> } | null>(null)
  const [traceBusy, setTraceBusy] = useState(false)
  const copyTimer = useRef<number | null>(null)
  const feedbackTimer = useRef<number | null>(null)

  const showFeedback = useCallback((type: Feedback['type'], text: string) => {
    setFeedback({ type, text })
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 6000)
  }, [])

  const loadDetail = useCallback(async () => {
    if (jobId == null) return
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(`/api/library/jobs/${jobId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '加载岗位详情失败')
      const detail = data as LibraryJobDetail
      setJob(detail)
      setGreetingDraft(detail.greeting || '')
      setTraceData(null)
      setRoleDraft(detail.role_type || '')
      setAppStatus(detail.application?.status || '')
      setJobStatus(detail.status || 'new')
      setAppNote('')
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载岗位详情失败')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => {
    if (!open || jobId == null) return
    setJob(null)
    setLoadError('')
    setFeedback(null)
    setBusy(null)
    setRoleDraft('')
    setAppStatus('')
    setAppNote('')
    setJobStatus('new')
    setCopiedKey('')
    setPrepResult(null)
    setPdfPath('')
    void loadDetail()
  }, [open, jobId, loadDetail])

  useEffect(() => () => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
  }, [])

  const copyText = async (key: string, text: string) => {
    if (!text) return
    const ok = await copyToClipboard(text)
    if (!ok) {
      showFeedback('error', '复制失败，请手动选择文本复制')
      return
    }
    setCopiedKey(key)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopiedKey(''), 1500)
  }

  const runProcess = async () => {
    if (jobId == null || busy) return
    setBusy('process')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/process`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '处理失败')
      const scoreText = data.score == null ? '—' : String(data.score)
      showFeedback(
        'success',
        `处理完成：评分 ${scoreText}${data.tailored ? '，已生成定制材料' : ''}${data.tailor_error ? `；定制失败：${data.tailor_error}` : ''}`,
      )
      await loadDetail()
      onChanged?.()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '处理失败')
    } finally {
      setBusy(null)
    }
  }

  const runPrep = async (force: boolean) => {
    if (jobId == null || busy) return
    setBusy(force ? 'prep-force' : 'prep')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/prep${force ? '?force=true' : ''}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '生成面试准备包失败')
      setPrepResult({
        content: String(data.content || ''),
        path: String(data.path || ''),
        cached: Boolean(data.cached),
      })
      showFeedback('success', data.cached ? '已加载缓存的面试准备包' : '面试准备包已生成')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '生成面试准备包失败')
    } finally {
      setBusy(null)
    }
  }

  const runPdf = async () => {
    if (jobId == null || busy) return
    setBusy('pdf')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/pdf`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '导出 PDF 失败')
      setPdfPath(String(data.path || ''))
      showFeedback('success', '定制简历 PDF 已导出')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '导出 PDF 失败')
    } finally {
      setBusy(null)
    }
  }

  const saveGreeting = async () => {
    if (jobId == null || greetingBusy) return
    const text = greetingDraft.trim()
    if (!text) {
      setFeedback({ type: 'error', text: '招呼语不能为空' })
      return
    }
    setGreetingBusy(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/jobs/${jobId}/greeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ greeting: text, confirmed: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存招呼语失败')
      setFeedback({ type: 'success', text: '招呼语已保存' })
      onChanged?.()
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : '保存招呼语失败' })
    } finally {
      setGreetingBusy(false)
    }
  }

  const loadScoreTrace = async () => {
    if (jobId == null || traceBusy) return
    setTraceBusy(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/score-trace`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '读取评分详情失败')
      setTraceData(data)
    } catch (err) {
      setFeedback({ type: 'error', text: err instanceof Error ? err.message : '读取评分详情失败' })
    } finally {
      setTraceBusy(false)
    }
  }

  const moveToRecycle = () => {
    if (jobId == null) return
    if (!window.confirm(`确定把「${job?.title || jobId}」移入回收站吗？`)) return
    onSoftDelete?.()
    onClose()
  }

  const saveRole = async () => {
    const nextRole = roleDraft.trim()
    if (!nextRole) {
      showFeedback('error', '方向不能为空')
      return
    }
    if (jobId == null || busy) return
    setBusy('role')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_type: nextRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存方向失败')
      showFeedback('success', '岗位方向已更新')
      await loadDetail()
      onChanged?.()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '保存方向失败')
    } finally {
      setBusy(null)
    }
  }

  const changeApplicationStatus = async (nextStatus: string) => {
    if (jobId == null || !job?.application || busy) return
    const previous = job.application.status
    setAppStatus(nextStatus)
    setBusy('app-status')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/application`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '更新投递状态失败')
      showFeedback('success', `投递台账状态已更新为「${APPLICATION_STATUS_LABELS[nextStatus] ?? nextStatus}」`)
      await loadDetail()
    } catch (err) {
      setAppStatus(previous)
      showFeedback('error', err instanceof Error ? err.message : '更新投递状态失败')
    } finally {
      setBusy(null)
    }
  }

  const saveApplicationNote = async () => {
    const note = appNote.trim()
    if (!note) {
      showFeedback('error', '请先输入备注内容')
      return
    }
    if (jobId == null || !job?.application || busy) return
    setBusy('app-note')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/application`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '保存备注失败')
      showFeedback('success', '投递备注已追加')
      await loadDetail()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '保存备注失败')
    } finally {
      setBusy(null)
    }
  }

  const changeJobStatus = async (nextStatus: string) => {
    if (jobId == null || busy) return
    const previous = job?.status || 'new'
    setJobStatus(nextStatus)
    setBusy('job-status')
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${jobId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '更新岗位状态失败')
      showFeedback('success', `岗位状态已更新为「${LIBRARY_JOB_STATUS_LABELS[nextStatus] ?? nextStatus}」`)
      await loadDetail()
      onChanged?.()
    } catch (err) {
      setJobStatus(previous)
      showFeedback('error', err instanceof Error ? err.message : '更新岗位状态失败')
    } finally {
      setBusy(null)
    }
  }

  const jd: LibraryJdJson = job?.jd_json ?? {}
  const skills = Array.isArray(jd.skill_points) ? jd.skill_points : []
  const skillLabels = skills
    .map((point) =>
      [point.name, point.category, point.level]
        .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
        .join(' · '),
    )
    .filter(Boolean)
  const companySize =
    typeof jd.company_size_people === 'number'
      ? `约 ${jd.company_size_people.toLocaleString('zh-CN')} 人`
      : ''

  const jdTab = (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <InfoItem label="公司" value={job?.company || toText(jd.company)} />
        <InfoItem label="城市" value={job?.city || toText(jd.city)} />
        <InfoItem label="经验要求" value={job?.years_required || toText(jd.years_required)} />
        <InfoItem label="学历要求" value={job?.education_required || toText(jd.education_required)} />
        <InfoItem label="公司性质" value={toText(jd.company_nature)} />
        <InfoItem label="公司规模" value={companySize} />
        <InfoItem
          label="薪资"
          value={formatSalary(job?.salary_min, job?.salary_max, job?.salary_note)}
        />
        <InfoItem label="方向" value={job?.role_type || ''} />
      </dl>
      <BulletList title="岗位职责" items={toTextList(jd.responsibilities)} />
      <BulletList title="硬性要求" items={toTextList(jd.must_have)} />
      <BulletList title="加分项" items={toTextList(jd.nice_to_have)} />
      <TextChipList title="技能点" items={skillLabels} />
      <TextChipList title="风险信号" items={toTextList(jd.red_flags)} tone="danger" />
      <TextChipList title="技能缺口" items={job?.missing_skills ?? []} tone="warning" />
      {job?.reject_reason && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          排除原因：{job.reject_reason}
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-muted">JD 原文</p>
        <div className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-card-border bg-surface p-3 text-xs leading-6 text-foreground">
          {job?.jd || '（该岗位没有 JD 原文）'}
        </div>
      </div>
      <div className="rounded-lg border border-card-border bg-surface p-3">
        <p className="text-xs font-semibold text-foreground">岗位方向修正</p>
        <p className="mt-0.5 text-[11px] text-muted">方向会影响评分标准与材料定制，最多 20 字。</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            value={roleDraft}
            maxLength={20}
            onChange={(e) => setRoleDraft(e.target.value)}
            placeholder="如：运维工程师"
            className="w-full sm:w-64"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void saveRole()}
            disabled={busy !== null || !roleDraft.trim()}
          >
            {busy === 'role' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            保存方向
          </Button>
        </div>
      </div>
    </div>
  )

  const ledgerTab = (
    <div className="space-y-4">
      {!job?.application ? (
        <p className="rounded-lg border border-dashed border-card-border bg-surface px-3 py-4 text-xs leading-5 text-muted">
          尚未生成投递记录。点击上方「重新评分+定制」生成打招呼语、求职信与定制简历后，这里会自动出现台账。
        </p>
      ) : (
        <div className="space-y-4 rounded-lg border border-card-border bg-surface p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">投递状态</p>
              <p className="mt-0.5 text-[11px] text-muted">
                当前：{APPLICATION_STATUS_LABELS[job.application.status] ?? job.application.status}
                {job.application.submitted_at ? ` · 投递于 ${job.application.submitted_at}` : ''}
              </p>
            </div>
            <Select
              value={appStatus}
              onChange={(e) => void changeApplicationStatus(e.target.value)}
              disabled={busy !== null}
              className="w-36"
              aria-label="投递台账状态"
            >
              {Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">备注</p>
            {job.application.notes && (
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-card px-2 py-1.5 text-[11px] leading-5 text-muted">
                {job.application.notes}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Textarea
                value={appNote}
                onChange={(e) => setAppNote(e.target.value)}
                rows={2}
                placeholder="追加备注，如：已收到 HR 回复，约周三面试"
                className="flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void saveApplicationNote()}
                disabled={!appNote.trim() || busy !== null}
                className="sm:self-end"
              >
                {busy === 'app-note' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                追加备注
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="rounded-lg border border-card-border bg-surface p-3">
        <p className="text-xs font-semibold text-foreground">岗位状态</p>
        {!isManualDetail(job) && (
          <p className="mt-1 text-[11px] leading-5 text-muted">
            采集岗位的状态(评分/打招呼/发送/回收)请在「工作台」管理；这里可维护投递台账与面试准备。
          </p>
        )}
        {isManualDetail(job) && (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select
                value={jobStatus}
                onChange={(e) => void changeJobStatus(e.target.value)}
                disabled={busy !== null}
                className="w-40"
                aria-label="岗位状态"
              >
                {LIBRARY_JOB_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {LIBRARY_JOB_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
              {busy === 'job-status' && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted">{JOB_STATUS_HINTS[jobStatus] ?? ''}</p>
          </>
        )}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} title="岗位详情" wide>
      <div className="space-y-4">
        {feedback && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-xs',
              feedback.type === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
            )}
          >
            {feedback.text}
          </div>
        )}

        {loadError && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <span>{loadError}</span>
            <Button type="button" size="sm" variant="secondary" onClick={() => void loadDetail()}>
              重试
            </Button>
          </div>
        )}

        {!job && loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            正在加载岗位详情…
          </div>
        )}

        {!job && !loading && !loadError && (
          <p className="py-12 text-center text-sm text-muted">暂无岗位详情</p>
        )}

        {job && (
          <>
            <div className="rounded-xl border border-card-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-foreground">{job.title || '未命名岗位'}</h3>
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        isManualDetail(job)
                          ? libraryStatusClass(job.status)
                          : 'border-card-border bg-surface-muted text-muted',
                      )}
                    >
                      {isManualDetail(job)
                        ? LIBRARY_JOB_STATUS_LABELS[job.status] ?? job.status
                        : getStatusLabel(job.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {[job.company, job.city, job.role_type].filter(Boolean).join(' · ') || '暂无公司与城市信息'}
                  </p>
                  {isHttpUrl(job.url) && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      查看原始岗位链接
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-[11px] text-muted">薪资</div>
                    <div className="mt-0.5 text-sm font-bold text-foreground">
                      {job.salary || formatSalary(job.salary_min, job.salary_max, job.salary_note)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted">匹配评分</div>
                    <div className={cn('mt-0.5 text-xl font-black leading-none', scoreClass(job.score))}>
                      {job.score == null || job.score === 0 ? '—' : job.score}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => void runProcess()} disabled={busy !== null}>
                {busy === 'process' ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                重新评分+定制
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void runPrep(false)}
                disabled={busy !== null}
              >
                {busy === 'prep' ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                面试准备包
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => void runPdf()}
                disabled={busy !== null}
              >
                {busy === 'pdf' ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="mr-1.5 h-4 w-4" />
                )}
                导出定制简历 PDF
              </Button>
              {!job.application && (
                <span className="text-[11px] text-muted">定制材料生成后会创建投递记录</span>
              )}
              {!isManualDetail(job) && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => void loadScoreTrace()}
                    disabled={traceBusy || busy !== null}
                  >
                    {traceBusy ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-4 w-4" />
                    )}
                    评分详情
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-danger hover:text-danger"
                    onClick={moveToRecycle}
                    disabled={busy !== null}
                  >
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    移入回收站
                  </Button>
                </>
              )}
            </div>

            {traceData && (
              <div className="rounded-xl border border-card-border bg-surface p-3">
                <p className="text-xs font-semibold text-foreground">
                  评分详情{traceData.state === 'available' ? '' : `（${traceData.state}）`}
                </p>
                {traceData.trace ? (
                  <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-card-border bg-card p-3 text-[11px] leading-5 text-foreground">
                    {JSON.stringify(traceData.trace, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {traceData.state === 'unavailable'
                      ? '该岗位没有可展示的评分明细（可能为关键词预筛或旧版评分）。'
                      : '暂无评分明细。'}
                  </p>
                )}
              </div>
            )}

            {prepResult && (
              <div className="rounded-xl border border-card-border bg-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground">
                      面试准备包{prepResult.cached ? '（已用缓存）' : '（已生成）'}
                    </p>
                    <p className="mt-0.5 break-all text-[11px] text-muted">{prepResult.path}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void copyText('prep', prepResult.content)}
                      disabled={!prepResult.content}
                    >
                      {copiedKey === 'prep' ? (
                        <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copiedKey === 'prep' ? '已复制' : '复制'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void runPrep(true)}
                      disabled={busy !== null}
                    >
                      {busy === 'prep-force' ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      强制重新生成
                    </Button>
                  </div>
                </div>
                {prepResult.cached && (
                  <p className="mt-2 rounded-lg bg-info-soft px-3 py-2 text-[11px] text-info">
                    已使用缓存，若 JD 或简历有更新，请点击「强制重新生成」。
                  </p>
                )}
                <div className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-card-border bg-card p-3 text-xs leading-6 text-foreground">
                  {prepResult.content || '准备包内容为空'}
                </div>
              </div>
            )}

            {pdfPath && (
              <div className="rounded-lg border border-card-border bg-surface px-3 py-2 text-xs text-muted">
                PDF 已导出：
                <span className="break-all font-mono text-foreground">{pdfPath}</span>
              </div>
            )}

            <Tabs
              tabs={[
                { key: 'jd', label: 'JD 详情', content: jdTab },
                {
                  key: 'greeting',
                  label: '打招呼语',
                  content: !isManualDetail(job) ? (
                    <div className="space-y-3">
                      <p className="text-[11px] leading-5 text-muted">
                        采集岗位的招呼语：可直接编辑保存(发送前人工确认仍由「工作台」把关)。
                      </p>
                      <Textarea
                        value={greetingDraft}
                        onChange={(e) => setGreetingDraft(e.target.value)}
                        rows={5}
                        maxLength={300}
                        placeholder="暂无招呼语：可到「工作台 → 确认待发」先生成，或在这里手写"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void saveGreeting()}
                          disabled={greetingBusy || !greetingDraft.trim()}
                        >
                          {greetingBusy ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          保存招呼语
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void copyText('greeting', greetingDraft)}
                          disabled={!greetingDraft}
                        >
                          {copiedKey === 'greeting' ? (
                            <Check className="mr-1.5 h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          {copiedKey === 'greeting' ? '已复制' : '复制'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <MaterialView
                      text={job.greeting_file}
                      copied={copiedKey === 'greeting'}
                      onCopy={() => void copyText('greeting', job.greeting_file)}
                    />
                  ),
                },
                {
                  key: 'cover-letter',
                  label: '求职信',
                  content: (
                    <MaterialView
                      text={job.cover_letter_file}
                      copied={copiedKey === 'cover-letter'}
                      onCopy={() => void copyText('cover-letter', job.cover_letter_file)}
                    />
                  ),
                },
                {
                  key: 'resume',
                  label: '定制简历',
                  content: (
                    <MaterialView
                      text={job.resume_file}
                      copied={copiedKey === 'resume'}
                      onCopy={() => void copyText('resume', job.resume_file)}
                    />
                  ),
                },
                { key: 'ledger', label: '投递台账', content: ledgerTab },
              ]}
            />
          </>
        )}
      </div>
    </Dialog>
  )
}

export default JobDetailModal
