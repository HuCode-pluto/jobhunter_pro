import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Eye, Loader2, Mic, RefreshCw, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'mp4', 'aac', 'flac', 'ogg']

interface InterviewQuestion {
  seq?: number
  question?: string
  category?: string
  your_answer?: string
  your_answer_rating?: number | null
  reference_answer?: string
  gap?: string
}

type SummaryItem = string | { skill?: string; reason?: string }

interface InterviewSummary {
  overall_score?: number | null
  highlights?: SummaryItem[]
  mistakes?: SummaryItem[]
  improvements?: SummaryItem[]
  follow_up_suggestions?: SummaryItem[]
  skill_gaps?: SummaryItem[]
}

interface InterviewReport {
  questions?: InterviewQuestion[]
  summary?: InterviewSummary | null
}

interface Interview {
  id: number
  job_id: number | null
  company: string
  position: string
  interview_date: string
  self_score: number | null
  status: string
  error?: string | null
  created_at?: string
}

interface InterviewDetail extends Interview {
  report?: InterviewReport | null
  questions?: InterviewQuestion[]
}

interface UploadResponse {
  ok: boolean
  id: number
  note?: string
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  processing: {
    label: '复盘中',
    className: 'bg-info-soft border-info-border text-info',
  },
  done: {
    label: '已完成',
    className: 'bg-success-soft border-success-border text-success',
  },
  failed: {
    label: '复盘失败',
    className: 'bg-danger-soft border-danger-border text-danger',
  },
}

type SummaryTone = 'default' | 'success' | 'danger' | 'warning' | 'info'

const SUMMARY_TONE_CLASSES: Record<SummaryTone, { title: string; dot: string }> = {
  default: { title: 'text-foreground', dot: 'bg-muted' },
  success: { title: 'text-success', dot: 'bg-success' },
  danger: { title: 'text-danger', dot: 'bg-danger' },
  warning: { title: 'text-warning', dot: 'bg-warning' },
  info: { title: 'text-info', dot: 'bg-info' },
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

function formatScore(score: number | null | undefined): string {
  return typeof score === 'number' && Number.isFinite(score) ? String(Math.round(score)) : '—'
}

function formatRating(rating: number | null | undefined): string {
  return typeof rating === 'number' && Number.isFinite(rating) ? `${Math.round(rating)}/5` : '未评分'
}

function formatSummaryItem(item: SummaryItem): string {
  if (typeof item === 'string') return item
  const skill = item.skill?.trim() || ''
  const reason = item.reason?.trim() || ''
  if (skill && reason) return `${skill}：${reason}`
  return skill || reason || '—'
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? {
    label: status || '未知状态',
    className: 'bg-surface border-card-border text-muted',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function SummaryList({
  title,
  items,
  tone = 'default',
}: {
  title: string
  items: SummaryItem[] | undefined
  tone?: SummaryTone
}) {
  const toneClasses = SUMMARY_TONE_CLASSES[tone]
  return (
    <div className="rounded-xl border border-card-border bg-card p-3">
      <h4 className={`text-xs font-black ${toneClasses.title}`}>{title}</h4>
      {items && items.length ? (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="flex gap-2 text-sm leading-6 text-foreground">
              <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses.dot}`} />
              <span className="min-w-0 whitespace-pre-wrap break-words">{formatSummaryItem(item)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">暂无记录</p>
      )}
    </div>
  )
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [company, setCompany] = useState('')
  const [position, setPosition] = useState('')
  const [interviewDate, setInterviewDate] = useState('')
  const [jobId, setJobId] = useState('')
  const [transcript, setTranscript] = useState('')
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [detail, setDetail] = useState<InterviewDetail | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const loadInterviews = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true)
    try {
      const res = await fetch('/api/library/interviews', { cache: 'no-store' })
      const data = await readJson<Interview[]>(res)
      if (!Array.isArray(data)) throw new Error('面试列表格式异常')
      setInterviews(data)
      setListError('')
    } catch (error) {
      setListError(getErrorMessage(error))
    } finally {
      if (!silent) setListLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInterviews()
  }, [loadInterviews])

  const hasProcessing = interviews.some(item => item.status === 'processing')
  useEffect(() => {
    if (!hasProcessing) return
    const timer = window.setInterval(() => {
      void loadInterviews(true)
    }, 8000)
    return () => window.clearInterval(timer)
  }, [hasProcessing, loadInterviews])

  const selectAudioFile = (file: File | undefined) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!AUDIO_EXTENSIONS.includes(ext)) {
      setFormError('仅支持 mp3 / m4a / wav / mp4 / aac / flac / ogg 音频格式')
      setFormMessage('')
      return
    }
    setAudioFile(file)
    setFormError('')
    setFormMessage('')
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedTranscript = transcript.trim()
    const trimmedJobId = jobId.trim()

    if (!trimmedTranscript && !audioFile) {
      setFormError('请上传录音文件，或粘贴转写文本（二选一）')
      setFormMessage('')
      return
    }
    if (trimmedJobId && !/^\d+$/.test(trimmedJobId)) {
      setFormError('关联岗位 ID 需为数字')
      setFormMessage('')
      return
    }

    setSubmitting(true)
    setFormError('')
    setFormMessage('')
    const formData = new FormData()
    if (trimmedJobId) formData.append('job_id', trimmedJobId)
    formData.append('company', company.trim())
    formData.append('position', position.trim())
    formData.append('interview_date', interviewDate)
    formData.append('transcript_text', trimmedTranscript)
    if (audioFile) formData.append('file', audioFile)

    try {
      const res = await fetch('/api/library/interviews', {
        method: 'POST',
        body: formData,
        cache: 'no-store',
      })
      const data = await readJson<UploadResponse>(res)
      setFormMessage(data.note || '复盘进行中')
      setCompany('')
      setPosition('')
      setInterviewDate('')
      setJobId('')
      setTranscript('')
      setAudioFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadInterviews(true)
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }

  const openDetail = async (id: number) => {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError('')
    setDetail(null)
    try {
      const res = await fetch(`/api/library/interviews/${id}`, { cache: 'no-store' })
      const data = await readJson<InterviewDetail>(res)
      setDetail(data)
    } catch (error) {
      setDetailError(getErrorMessage(error))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleRetry = async (id: number) => {
    setRetryingId(id)
    setListError('')
    try {
      const res = await fetch(`/api/library/interviews/${id}/retry`, {
        method: 'POST',
        cache: 'no-store',
      })
      await readJson<{ ok: boolean }>(res)
      await loadInterviews(true)
    } catch (error) {
      setListError(getErrorMessage(error))
    } finally {
      setRetryingId(null)
    }
  }

  const report = detail?.report ?? null
  const summary = report?.summary ?? null
  const reportQuestions = report && Array.isArray(report.questions) ? report.questions : []
  const storedQuestions = detail && Array.isArray(detail.questions) ? detail.questions : []
  const detailQuestions = reportQuestions.length ? reportQuestions : storedQuestions
  const overallScore = summary?.overall_score ?? detail?.self_score

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Mic className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">面试复盘</h1>
          <p className="mt-1 text-sm text-muted">上传面试录音或转写文本，AI 会提取问题、生成高分答案并总结改进方向。</p>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-black text-foreground">新增复盘</CardTitle>
          <p className="text-xs leading-5 text-muted">录音与转写文本二选一。提交后会在后台进行转写和 AI 分析，可以稍后在下方查看状态。</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1.5 text-xs font-bold text-muted">
                <span>公司</span>
                <Input value={company} onChange={event => setCompany(event.target.value)} placeholder="如：某科技公司" />
              </label>
              <label className="space-y-1.5 text-xs font-bold text-muted">
                <span>职位</span>
                <Input value={position} onChange={event => setPosition(event.target.value)} placeholder="如：运维工程师" />
              </label>
              <label className="space-y-1.5 text-xs font-bold text-muted">
                <span>面试日期</span>
                <Input type="date" value={interviewDate} onChange={event => setInterviewDate(event.target.value)} />
              </label>
              <label className="space-y-1.5 text-xs font-bold text-muted">
                <span>关联岗位 ID（可选）</span>
                <Input
                  inputMode="numeric"
                  value={jobId}
                  onChange={event => setJobId(event.target.value)}
                  placeholder="如：12"
                />
              </label>
            </div>

            <label className="block space-y-1.5 text-xs font-bold text-muted">
              <span>转写文本</span>
              <Textarea
                rows={5}
                value={transcript}
                onChange={event => setTranscript(event.target.value)}
                placeholder="粘贴面试的转写文本，或上传会议字幕内容。"
                className="min-h-[120px] leading-7"
              />
            </label>

            <div className="space-y-1.5">
              <div className="text-xs font-bold text-muted">录音文件（可选）</div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.m4a,.wav,.mp4,.aac,.flac,.ogg"
                aria-label="上传面试录音文件"
                className="hidden"
                onChange={event => selectAudioFile(event.target.files?.[0])}
              />
              <div
                onDragOver={event => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={event => {
                  event.preventDefault()
                  setDragging(false)
                }}
                onDrop={event => {
                  event.preventDefault()
                  setDragging(false)
                  selectAudioFile(event.dataTransfer.files?.[0])
                }}
                className={`flex flex-col gap-3 rounded-2xl border border-dashed p-4 transition-colors sm:flex-row sm:items-center ${
                  dragging ? 'border-primary bg-primary/5' : 'border-card-border bg-surface'
                }`}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-foreground">
                      {audioFile ? audioFile.name : '拖放音频到此处，或选择本地文件'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">支持 mp3 / m4a / wav / mp4 / aac / flac / ogg</p>
                  </div>
                </div>
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                  {audioFile ? '重新选择' : '选择文件'}
                </Button>
              </div>
            </div>

            {formError && (
              <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
                {formError}
              </p>
            )}
            {formMessage && (
              <p role="status" className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-xs text-success">
                {formMessage}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Mic className="mr-1.5 h-4 w-4" />}
                {submitting ? '提交中...' : '提交复盘'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-sm font-black text-foreground">复盘记录</CardTitle>
            <p className="mt-1 text-xs text-muted">
              共 {interviews.length} 条{hasProcessing ? '，存在处理中记录时每 8 秒自动刷新' : ''}
            </p>
          </div>
          <Button variant="ghost" size="sm" disabled={listLoading} onClick={() => void loadInterviews()}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${listLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </CardHeader>
        <CardContent>
          {listError && (
            <p role="alert" className="mb-3 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
              {listError}
            </p>
          )}

          {listLoading && interviews.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : interviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-card-border bg-surface px-5 py-10 text-center">
              <p className="text-sm font-bold text-foreground">还没有面试复盘记录</p>
              <p className="mt-1 text-xs text-muted">先在上方新增一次复盘，AI 生成结果后会显示在这里。</p>
            </div>
          ) : (
            <div className="divide-y divide-card-border">
              {interviews.map(item => (
                <div
                  key={item.id}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-black text-foreground">{item.company || '未填写公司'}</span>
                      <span className="text-muted">·</span>
                      <span className="truncate text-sm text-muted">{item.position || '未填写职位'}</span>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>面试日期：{item.interview_date || '未填写'}</span>
                      <span>
                        自评分：<span className="font-bold text-foreground">{formatScore(item.self_score)}</span>
                      </span>
                    </div>
                    {item.status === 'failed' && item.error && (
                      <p className="mt-1.5 line-clamp-2 text-xs text-danger">{item.error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => void openDetail(item.id)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      查看详情
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={item.status === 'processing' || retryingId === item.id}
                      onClick={() => void handleRetry(item.id)}
                    >
                      {retryingId === item.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      )}
                      重试
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} title="面试复盘详情" wide>
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载复盘详情...
          </div>
        ) : detailError ? (
          <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">{detailError}</div>
        ) : detail ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-card-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={detail.status} />
                    <span className="text-xs text-muted">面试日期：{detail.interview_date || '未填写'}</span>
                  </div>
                  <h3 className="mt-2 break-words text-xl font-black text-foreground">
                    {detail.company || '未填写公司'}
                    <span className="mx-1.5 text-muted">·</span>
                    {detail.position || '未填写职位'}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <span>
                      自评分：<span className="font-bold text-foreground">{formatScore(detail.self_score)}</span>
                    </span>
                    {detail.job_id != null && <span>关联岗位 #{detail.job_id}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold text-muted">复盘总分</div>
                  <div className="flex items-end justify-end gap-1">
                    <span className="text-5xl font-black leading-none text-primary">{formatScore(overallScore)}</span>
                    <span className="pb-1 text-xs font-bold text-muted">/ 100</span>
                  </div>
                </div>
              </div>
            </div>

            {detail.status === 'failed' && (
              <div className="rounded-xl border border-danger-border bg-danger-soft px-4 py-3 text-sm text-danger">
                <p className="font-black">复盘失败</p>
                <p className="mt-1 whitespace-pre-wrap break-words leading-6">{detail.error || '未返回错误信息，请稍后重试。'}</p>
              </div>
            )}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-foreground">问题复盘</h3>
                <span className="text-xs text-muted">共 {detailQuestions.length} 题</span>
              </div>

              {detailQuestions.length ? (
                <div className="space-y-3">
                  {detailQuestions.map((question, index) => (
                    <div key={`${question.seq ?? index}-${index}`} className="rounded-2xl border border-card-border bg-card p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-black text-primary">
                          {question.seq ?? index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-info-border bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">
                              {question.category || '未分类'}
                            </span>
                            <p className="min-w-0 break-words text-sm font-black leading-6 text-foreground">
                              {question.question || '未识别到问题内容'}
                            </p>
                          </div>

                          <div className="mt-3 rounded-xl border border-card-border bg-surface px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-black text-muted">你的回答</span>
                              <span className="rounded-full border border-card-border bg-card px-2 py-0.5 text-[11px] font-bold text-muted">
                                {formatRating(question.your_answer_rating)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                              {question.your_answer || '未记录现场回答'}
                            </p>
                          </div>

                          <div className="mt-2 rounded-xl border border-success-border bg-success-soft px-3 py-2">
                            <div className="text-xs font-black text-success">参考高分答案</div>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-success">
                              {question.reference_answer || '暂无参考答案'}
                            </p>
                          </div>

                          {question.gap && (
                            <div className="mt-2 rounded-xl border border-warning-border bg-warning-soft px-3 py-2">
                              <div className="text-xs font-black text-warning">差距与改进</div>
                              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-7 text-warning">
                                {question.gap}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-card-border bg-surface px-4 py-8 text-center text-sm text-muted">
                  {detail.status === 'processing' ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      问题分析生成中，请稍后刷新
                    </span>
                  ) : (
                    '暂无问题复盘内容'
                  )}
                </div>
              )}
            </section>

            {summary && (
              <section className="space-y-3">
                <h3 className="text-sm font-black text-foreground">整体总结</h3>
                <div className="grid gap-3 md:grid-cols-2">
                  <SummaryList title="亮点" items={summary.highlights} tone="success" />
                  <SummaryList title="失误" items={summary.mistakes} tone="danger" />
                  <SummaryList title="改进清单" items={summary.improvements} tone="warning" />
                  <SummaryList title="后续跟进建议" items={summary.follow_up_suggestions} tone="info" />
                  <SummaryList title="技能短板" items={summary.skill_gaps} tone="default" />
                </div>
              </section>
            )}

            {!summary && detail.status === 'processing' && (
              <div className="flex items-center gap-2 rounded-xl border border-info-border bg-info-soft px-4 py-3 text-sm text-info">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                复盘报告仍在生成中，关闭弹窗后状态会自动刷新。
              </div>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  )
}
