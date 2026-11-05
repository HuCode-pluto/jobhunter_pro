import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  BriefcaseBusiness,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { ScoreJobsDialog } from '@/components/dashboard/ScoreJobsDialog'
import { OutsourcingBadge } from '@/components/jobs/OutsourcingBadge'
import { AddJobDialog } from '@/components/library/AddJobDialog'
import { JobDetailModal } from '@/components/library/JobDetailModal'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
  LIBRARY_JOB_STATUSES,
  LIBRARY_JOB_STATUS_LABELS,
  libraryStatusClass,
} from '@/lib/libraryStatus'
import { getStatusLabel, STATUS_LABELS } from '@/lib/status'
import { cn } from '@/lib/utils'

export interface LibraryJob {
  id: string
  title: string
  company: string
  salary: string
  city: string
  experience: string
  education: string
  jd: string
  jd_json: string
  url: string
  score: number
  score_reason: string
  greeting: string
  status: string
  source_platform: string
  source_keyword: string
  role_type: string
  salary_min: number | null
  salary_max: number | null
  salary_note: string
  reject_reason: string
  created_at: string
  deleted_at: string | null
  deleted_reason: string | null
  outsourcing_level?: string
  outsourcing_matches?: string[]
}

type Feedback = { type: 'success' | 'error'; text: string }

function isHttpUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  note?: string,
): string {
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

function isManualJob(job: LibraryJob): boolean {
  return job.source_platform === 'manual'
}

function sourceLabel(job: LibraryJob): string {
  if (isManualJob(job)) return '手动'
  return `采集·${job.source_platform || '平台'}`
}

function jobStatusLabel(job: LibraryJob): string {
  if (isManualJob(job)) return LIBRARY_JOB_STATUS_LABELS[job.status] ?? job.status
  return getStatusLabel(job.status)
}

function scoreClass(score: number | null | undefined): string {
  if (score == null) return 'text-muted'
  if (score >= 80) return 'text-success'
  if (score >= 60) return 'text-primary'
  return 'text-danger'
}

export default function LibraryPage() {
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [keyword, setKeyword] = useState('')
  const [minScore, setMinScore] = useState('')
  const [jobs, setJobs] = useState<LibraryJob[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [resumeMissing, setResumeMissing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [detailJobId, setDetailJobId] = useState<string | null>(null)
  const [processingIds, setProcessingIds] = useState<string[]>([])
  const [batchProcessing, setBatchProcessing] = useState(false)
  const [viewMode, setViewMode] = useState<'jobs' | 'recycle'>('jobs')
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [sortBy, setSortBy] = useState<'score' | 'created'>('score')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx')
  const [batchStatus, setBatchStatus] = useState('')
  const feedbackTimer = useRef<number | null>(null)
  const requestRevision = useRef(0)

  const showFeedback = (type: Feedback['type'], text: string) => {
    setFeedback({ type, text })
    if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 6000)
  }

  const loadResumeStatus = async () => {
    try {
      const res = await fetch('/api/library/resume/structured', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) setResumeMissing(data?.exists === false)
    } catch {
      // 简历状态只用于提示，读取失败不影响岗位库使用。
    }
  }

  const loadJobs = async () => {
    const revision = ++requestRevision.current
    setLoading(true)
    setLoadError('')
    const params = new URLSearchParams()
    params.set('deleted', viewMode === 'recycle' ? 'only' : 'active')
    if (viewMode === 'jobs') {
      if (role.trim()) params.set('role', role.trim())
      if (status) params.set('status', status)
      if (source) params.set('source', source)
      if (keyword.trim()) params.set('keyword', keyword.trim())
    }
    if (minScore.trim()) {
      const parsed = Number(minScore)
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
        params.set('min_score', String(parsed))
      }
    }
    params.set('sort', sortBy)
    params.set('order', sortOrder)
    params.set('limit', '100')
    params.set('offset', String(page * 100))
    try {
      const res = await fetch(`/api/library/jobs?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '读取岗位库失败')
      if (revision !== requestRevision.current) return
      const list = Array.isArray(data) ? (data as LibraryJob[]) : []
      setJobs(list)
      const totalHeader = res.headers.get('X-Total-Count')
      if (totalHeader != null) setTotal(Number(totalHeader) || 0)
      setSelectedIds((prev) => prev.filter((id) => list.some((job) => job.id === id)))
    } catch (err) {
      if (revision !== requestRevision.current) return
      setJobs([])
      setSelectedIds([])
      setLoadError(err instanceof Error ? err.message : '读取岗位库失败')
    } finally {
      if (revision === requestRevision.current) setLoading(false)
    }
  }

  const refresh = () => {
    setPage(0)
    const rawMinScore = minScore.trim()
    if (rawMinScore !== '') {
      const parsed = Number(rawMinScore)
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        showFeedback('error', '最低评分请输入 0 到 100 之间的数字')
        return
      }
    }
    void loadJobs()
    void loadResumeStatus()
  }

  // 初始仅加载一次，筛选条件通过刷新按钮应用。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadJobs()
    void loadResumeStatus()
    return () => {
      if (feedbackTimer.current) window.clearTimeout(feedbackTimer.current)
    }
  }, [])

  // 切换 岗位列表/回收站 视图时重新加载
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadJobs()
  }, [viewMode])

  // 排序/分页变化自动重载
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadJobs()
  }, [sortBy, sortOrder, page])

  const processJob = async (job: LibraryJob) => {
    if (processingIds.includes(job.id) || batchProcessing) return
    setProcessingIds((prev) => [...prev, job.id])
    setFeedback(null)
    try {
      const res = await fetch(`/api/library/jobs/${job.id}/process`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '处理失败')
      const scoreText = data.score == null ? '—' : String(data.score)
      showFeedback(
        'success',
        `「${job.title || `#${job.id}`}」处理完成：评分 ${scoreText}${data.tailored ? '，已生成定制材料' : ''}${data.tailor_error ? `；定制失败：${data.tailor_error}` : ''}`,
      )
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '处理失败')
    } finally {
      setProcessingIds((prev) => prev.filter((id) => id !== job.id))
    }
  }

  const batchProcess = async () => {
    if (!selectedIds.length || batchProcessing) return
    const ids = [...selectedIds]
    setBatchProcessing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/library/jobs/batch-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '批量处理失败')
      const results: Array<{ id?: string; error?: string }> = Array.isArray(data.results)
        ? (data.results as Array<{ id?: string; error?: string }>)
        : []
      const failedCount = results.filter((item) => item.error).length
      const okCount =
        typeof data.ok_count === 'number' ? data.ok_count : Math.max(results.length - failedCount, 0)
      showFeedback(
        failedCount ? 'error' : 'success',
        `批量处理完成：成功 ${okCount} 条${failedCount ? `，失败 ${failedCount} 条` : ''}`,
      )
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '批量处理失败')
    } finally {
      setBatchProcessing(false)
    }
  }

  const softDeleteJobs = async (ids: string[], reason = '用户移入回收站') => {
    if (!ids.length || batchProcessing) return
    setBatchProcessing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/jobs/soft-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: ids, confirmed: true, reason }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '移入回收站失败')
      showFeedback('success', `已移入回收站 ${ids.length} 条`)
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '移入回收站失败')
    } finally {
      setBatchProcessing(false)
    }
  }

  const restoreJobs = async (ids: string[]) => {
    if (!ids.length || batchProcessing) return
    setBatchProcessing(true)
    try {
      const res = await fetch('/api/jobs/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: ids }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '恢复失败')
      showFeedback('success', `已恢复 ${ids.length} 条`)
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '恢复失败')
    } finally {
      setBatchProcessing(false)
    }
  }

  const permanentDeleteJobs = async (ids: string[]) => {
    if (!ids.length || batchProcessing) return
    if (!window.confirm(`确定彻底删除 ${ids.length} 条岗位吗？此操作不可恢复。`)) return
    setBatchProcessing(true)
    try {
      const res = await fetch('/api/jobs/permanent-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: ids, confirmed: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '彻底删除失败')
      showFeedback('success', `已彻底删除 ${ids.length} 条`)
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '彻底删除失败')
    } finally {
      setBatchProcessing(false)
    }
  }

  const exportJobs = async () => {
    if (exporting) return
    setExporting(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/jobs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: exportFormat,
          scope: selectedIds.length ? 'selected' : 'all',
          job_ids: selectedIds,
          filters: {},
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '导出失败')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `jobhunter_pro-jobs-${new Date().toISOString().slice(0, 10)}.${exportFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showFeedback('success', selectedIds.length ? `已导出选中的 ${selectedIds.length} 条` : '已导出全部岗位')
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const batchSetStatus = async (target: string) => {
    if (!selectedIds.length || batchProcessing) return
    setBatchProcessing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/jobs/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: selectedIds, status: target }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '批量状态修改失败')
      showFeedback('success', `已更新 ${selectedIds.length} 条岗位状态`)
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '批量状态修改失败')
    } finally {
      setBatchProcessing(false)
      setBatchStatus('')
    }
  }

  const markManuallySent = async () => {
    if (!selectedIds.length || batchProcessing) return
    if (!window.confirm(`确定把选中的 ${selectedIds.length} 条标记为已投递吗？`)) return
    setBatchProcessing(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/jobs/manual-sent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_ids: selectedIds, confirmed: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '标记已投失败')
      showFeedback('success', `已标记 ${selectedIds.length} 条为已投递`)
      setSelectedIds([])
      await loadJobs()
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : '标记已投失败')
    } finally {
      setBatchProcessing(false)
    }
  }

  const startScoring = async (options: {
    scope: 'pending' | 'failed' | 'selected' | 'all_scored'
    limit: number | null
    job_ids: string[]
    force_rescore: boolean
  }): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/scoring/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error || '启动评分失败' }
      showFeedback('success', '评分任务已启动，进度请到「工作台」查看')
      await loadJobs()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '启动评分失败' }
    }
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    )
  }

  const allSelected = jobs.length > 0 && jobs.every((job) => selectedIds.includes(job.id))
  const filtersActive = role.trim() !== '' || status !== '' || minScore.trim() !== ''

  const toggleAll = () => {
    if (allSelected) setSelectedIds([])
    else setSelectedIds(jobs.map((job) => job.id))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-foreground">岗位库</h1>
        <p className="mt-1 text-xs text-muted">
          手动粘贴与平台采集的岗位统一管理：AI 解析评分、投递材料定制、面试准备与台账。
        </p>
      </div>

      {resumeMissing && (
        <div className="rounded-lg px-3 py-2 text-xs bg-warning-soft text-warning">
          尚未配置结构化简历，请先上传简历或在详情页解析。
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-32"
            aria-label="来源筛选"
          >
            <option value="">全部来源</option>
            <option value="manual">手动粘贴</option>
            <option value="collected">平台采集</option>
          </Select>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') refresh()
            }}
            placeholder="标题/公司关键词"
            className="w-40"
            aria-label="关键词筛选"
          />
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') refresh()
            }}
            placeholder="方向筛选，如：运维工程师"
            className="w-44"
            aria-label="方向筛选"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-40"
            aria-label="状态筛选"
          >
            <option value="">全部状态</option>
            {(source === 'collected' ? [] : LIBRARY_JOB_STATUSES).map((item) => (
              <option key={item} value={item}>
                手动·{LIBRARY_JOB_STATUS_LABELS[item]}
              </option>
            ))}
            {source !== 'manual' && (
              <optgroup label="采集状态">
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
          <Input
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') refresh()
            }}
            type="number"
            min={0}
            max={100}
            placeholder="最低评分"
            className="w-32"
            aria-label="最低评分"
          />
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            刷新
          </Button>
          <Button type="button" className="ml-auto" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            添加岗位
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex rounded-xl border border-card-border bg-surface p-1">
            <button
              type="button"
              onClick={() => {
                setViewMode('jobs')
                setSelectedIds([])
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                viewMode === 'jobs' ? 'bg-secondary text-primary font-black' : 'text-muted hover:text-foreground',
              )}
            >
              岗位列表
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('recycle')
                setSelectedIds([])
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                viewMode === 'recycle' ? 'bg-secondary text-primary font-black' : 'text-muted hover:text-foreground',
              )}
            >
              <Archive className="mr-1 inline h-3.5 w-3.5" />
              回收站
            </button>
          </div>
          {viewMode === 'jobs' && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void exportJobs()}
                disabled={exporting || loading}
              >
                {exporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                {selectedIds.length ? `导出选中(${selectedIds.length})` : '导出全部'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setScoreDialogOpen(true)}
                disabled={loading}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                批量评分
              </Button>
              <Select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as 'xlsx' | 'csv')}
                className="w-20"
                aria-label="导出格式"
              >
                <option value="xlsx">xlsx</option>
                <option value="csv">csv</option>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setScoreDialogOpen(true)}
                disabled={loading}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                批量评分
              </Button>
              <Select
                value={batchStatus}
                onChange={(e) => {
                  const value = e.target.value
                  setBatchStatus(value)
                  if (!value) return
                  void batchSetStatus(value)
                }}
                className="w-32"
                aria-label="批量状态"
                disabled={!selectedIds.length || batchProcessing}
              >
                <option value="">批量状态…</option>
                <option value="ready">待确认</option>
                <option value="filtered">已过滤</option>
                <option value="skipped">已跳过</option>
                <option value="rejected">已拒绝</option>
              </Select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void markManuallySent()}
                disabled={!selectedIds.length || batchProcessing}
              >
                标记已投{selectedIds.length ? `(${selectedIds.length})` : ''}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void softDeleteJobs(selectedIds)}
                disabled={!selectedIds.length || batchProcessing}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                移入回收站{selectedIds.length ? `(${selectedIds.length})` : ''}
              </Button>
            </>
          )}
          {viewMode === 'recycle' && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void restoreJobs(selectedIds)}
                disabled={!selectedIds.length || batchProcessing}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                恢复{selectedIds.length ? `(${selectedIds.length})` : ''}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void permanentDeleteJobs(selectedIds)}
                disabled={!selectedIds.length || batchProcessing}
                className="text-danger hover:text-danger"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                彻底删除{selectedIds.length ? `(${selectedIds.length})` : ''}
              </Button>
            </>
          )}
          {viewMode === 'recycle' && (
            <span className="ml-auto text-xs text-muted">回收站中的岗位不会参与评分、发送与统计</span>
          )}
        </CardContent>
      </Card>

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
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs bg-danger-soft text-danger">
          <span>{loadError}</span>
          <Button type="button" size="sm" variant="secondary" onClick={refresh}>
            重试
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 px-5 py-4">
          <CardTitle>岗位列表</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">
              {selectedIds.length > 0 ? `已选 ${selectedIds.length} 条` : `共 ${jobs.length} 条`}
            </span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className={viewMode === 'recycle' ? 'hidden' : ''}
              onClick={() => void batchProcess()}
              disabled={!selectedIds.length || batchProcessing || processingIds.length > 0}
            >
              {batchProcessing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              批量处理{selectedIds.length ? `（${selectedIds.length}）` : ''}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-card-border bg-surface text-xs text-muted">
                  <th className="w-10 px-3 py-3 text-center font-bold">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      disabled={!jobs.length || batchProcessing}
                      aria-label="全选岗位"
                      className="h-3.5 w-3.5 cursor-pointer rounded border-card-border accent-primary disabled:cursor-not-allowed"
                    />
                  </th>
                  <th className="px-3 py-3 text-left font-bold">标题</th>
                  <th className="px-3 py-3 text-left font-bold">公司</th>
                  <th className="px-3 py-3 text-left font-bold">城市</th>
                  <th className="px-3 py-3 text-left font-bold">薪资</th>
                  <th className="px-3 py-3 text-left font-bold">来源</th>
                  <th className="px-3 py-3 text-left font-bold">方向</th>
                  <th className="px-3 py-3 text-left font-bold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => {
                        if (sortBy === 'score') setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                        else setSortBy('score')
                      }}
                    >
                      评分
                      {sortBy === 'score' && (sortOrder === 'desc' ? ' ↓' : ' ↑')}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left font-bold">状态</th>
                  <th className="px-3 py-3 text-left font-bold">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => {
                        if (sortBy === 'created') setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
                        else setSortBy('created')
                      }}
                    >
                      时间
                      {sortBy === 'created' && (sortOrder === 'desc' ? ' ↓' : ' ↑')}
                    </button>
                  </th>
                  <th className="px-3 py-3 text-left font-bold">操作</th>
                </tr>
              </thead>
              <tbody>
                {loading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-16">
                      <div className="flex items-center justify-center gap-2 text-sm text-muted">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        正在读取岗位库…
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && !loadError && jobs.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                        <BriefcaseBusiness className="h-8 w-8 text-muted/60" />
                        <p className="text-sm font-semibold text-foreground">
                          {filtersActive ? '没有符合条件的岗位' : '岗位库还是空的'}
                        </p>
                        <p className="text-xs leading-5 text-muted">
                          {filtersActive
                            ? '试试调整方向、状态或最低评分后刷新。'
                            : '点击「添加岗位」，粘贴 JD、截图或链接开始整理。'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
                {jobs.map((job) => {
                  const processing = processingIds.includes(job.id)
                  if (viewMode === 'recycle') {
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-card-border transition-colors last:border-0 hover:bg-surface/50"
                      >
                        <td className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(job.id)}
                            onChange={() => toggleSelected(job.id)}
                            disabled={batchProcessing}
                            aria-label={`选择岗位：${job.title || job.id}`}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-card-border accent-primary disabled:cursor-not-allowed"
                          />
                        </td>
                        <td className="max-w-[18rem] truncate px-3 py-3 font-semibold text-foreground" title={job.title}>
                          {job.title || '未命名岗位'}
                        </td>
                        <td className="max-w-[12rem] truncate px-3 py-3 text-xs text-muted">{job.company || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                              isManualJob(job)
                                ? 'border-cyan-border bg-cyan-soft text-cyan'
                                : 'border-card-border bg-surface-muted text-muted',
                            )}
                          >
                            {sourceLabel(job)}
                          </span>
                        </td>
                        <td className="max-w-[16rem] truncate px-3 py-3 text-xs text-muted" title={job.deleted_reason || ''}>
                          {job.deleted_reason || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{job.deleted_at || ''}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => void restoreJobs([job.id])}
                              disabled={batchProcessing}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" />
                              恢复
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="text-danger hover:text-danger"
                              onClick={() => void permanentDeleteJobs([job.id])}
                              disabled={batchProcessing}
                            >
                              <Trash2 className="mr-1 h-3.5 w-3.5" />
                              彻底删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr
                      key={job.id}
                      className="border-b border-card-border transition-colors last:border-0 hover:bg-surface/50"
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(job.id)}
                          onChange={() => toggleSelected(job.id)}
                          disabled={batchProcessing}
                          aria-label={`选择岗位：${job.title || job.id}`}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-card-border accent-primary disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setDetailJobId(job.id)}
                            className="max-w-[18rem] truncate text-left font-semibold text-foreground hover:text-primary"
                            title={job.title || '未命名岗位'}
                          >
                            {job.title || '未命名岗位'}
                          </button>
                          <OutsourcingBadge job={job as never} />
                          {isHttpUrl(job.url) && (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-muted hover:text-primary"
                              aria-label="打开原始岗位链接"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[12rem] truncate px-3 py-3 text-xs text-muted">
                        {job.company || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">
                        {job.city || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-foreground">
                        {job.salary || formatSalary(job.salary_min, job.salary_max, job.salary_note)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            isManualJob(job)
                              ? 'border-cyan-border bg-cyan-soft text-cyan'
                              : 'border-card-border bg-surface-muted text-muted',
                          )}
                        >
                          {sourceLabel(job)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          {job.role_type || '未分类'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={cn('text-base font-black', scoreClass(job.score))}>
                          {job.score == null || job.score === 0 ? '—' : job.score}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                            isManualJob(job)
                              ? libraryStatusClass(job.status)
                              : 'border-card-border bg-surface-muted text-muted',
                          )}
                        >
                          {jobStatusLabel(job)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => setDetailJobId(job.id)}
                          >
                            详情
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void processJob(job)}
                            disabled={processing || batchProcessing}
                          >
                            {processing ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1 h-3.5 w-3.5" />
                            )}
                            {processing ? '处理中…' : '立即处理'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
        {(total > 100 || page > 0) && (
          <div className="flex items-center justify-between border-t border-card-border px-5 py-3">
            <span className="text-xs text-muted">
              共 {total} 条 · 第 {page + 1}/{Math.max(1, Math.ceil(total / 100))} 页
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPage((p) => Math.max(0, p - 1))
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={page === 0 || loading}
              >
                上一页
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  setPage((p) => p + 1)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                disabled={(page + 1) * 100 >= total || loading}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </Card>

      <AddJobDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => void loadJobs()}
      />
      <JobDetailModal
        open={detailJobId !== null}
        jobId={detailJobId}
        onClose={() => setDetailJobId(null)}
        onChanged={() => void loadJobs()}
        onSoftDelete={() => void softDeleteJobs(detailJobId ? [detailJobId] : [])}
      />
      <ScoreJobsDialog
        open={scoreDialogOpen}
        selectedJobIds={selectedIds}
        onClose={() => setScoreDialogOpen(false)}
        onStart={startScoring}
      />
    </div>
  )
}
