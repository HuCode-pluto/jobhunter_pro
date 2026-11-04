import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BarChart3, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Dialog } from '@/components/ui/dialog'

type OfferStatus = 'pending' | 'accepted' | 'rejected'

interface RecentInterview {
  id: number
  company: string
  position: string
  interview_date: string
  self_score: number | null
  status: string
}

interface WeeklyReport {
  total_jobs: number
  applied: number
  matched_60plus: number
  avg_score: number | null
  interviews: number
  offers: number
  by_status: Record<string, number>
  recent_interviews: RecentInterview[]
}

interface Offer {
  id: number
  company: string
  position: string
  salary_min: number | null
  salary_max: number | null
  salary_note: string
  city: string
  commute: string
  pros: string
  cons: string
  status: string
  created_at: string
}

interface OfferFormState {
  company: string
  position: string
  salary_min: string
  salary_max: string
  salary_note: string
  city: string
  commute: string
  pros: string
  cons: string
  status: OfferStatus
}

const EMPTY_OFFER_FORM: OfferFormState = {
  company: '',
  position: '',
  salary_min: '',
  salary_max: '',
  salary_note: '',
  city: '',
  commute: '',
  pros: '',
  cons: '',
  status: 'pending',
}

const JOB_STATUS_META = [
  { key: 'new', label: '新岗位', barClass: 'bg-info' },
  { key: 'matched', label: '匹配可投', barClass: 'bg-cyan' },
  { key: 'interested', label: '有意向', barClass: 'bg-purple' },
  { key: 'applied', label: '已投递', barClass: 'bg-warning' },
  { key: 'interview', label: '面试中', barClass: 'bg-sky' },
  { key: 'offer', label: 'Offer', barClass: 'bg-success' },
  { key: 'rejected', label: '已排除', barClass: 'bg-danger' },
] as const

const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  processing: '分析中',
  done: '已完成',
  failed: '分析失败',
}

const OFFER_STATUS_META: Record<OfferStatus, { label: string; className: string }> = {
  pending: {
    label: '待定',
    className: 'bg-warning-soft border-warning-border text-warning',
  },
  accepted: {
    label: '已接受',
    className: 'bg-success-soft border-success-border text-success',
  },
  rejected: {
    label: '已拒绝',
    className: 'bg-danger-soft border-danger-border text-danger',
  },
}

const FIELD_LABEL_CLASS = 'mb-1 block text-xs font-black text-foreground'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || '请求失败')
  }
  return data as T
}

function isOfferStatus(value: string): value is OfferStatus {
  return value === 'pending' || value === 'accepted' || value === 'rejected'
}

function offerStatusMeta(status: string) {
  return isOfferStatus(status) ? OFFER_STATUS_META[status] : OFFER_STATUS_META.pending
}

function formatSalary(offer: Offer): string {
  let range = ''
  if (offer.salary_min != null && offer.salary_max != null) {
    range = `${offer.salary_min} - ${offer.salary_max}`
  } else if (offer.salary_min != null) {
    range = String(offer.salary_min)
  } else if (offer.salary_max != null) {
    range = String(offer.salary_max)
  }
  if (range && offer.salary_note) return `${range} · ${offer.salary_note}`
  return range || offer.salary_note || '薪资待补充'
}

function parseAmount(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const amount = Number(text)
  return Number.isFinite(amount) ? amount : null
}

export default function CareerPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null)
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState<string | null>(null)

  const [offers, setOffers] = useState<Offer[]>([])
  const [offersLoading, setOffersLoading] = useState(true)
  const [offersError, setOffersError] = useState<string | null>(null)

  const [notice, setNotice] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<OfferFormState>({ ...EMPTY_OFFER_FORM })
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadReport = useCallback(async () => {
    setReportLoading(true)
    setReportError(null)
    try {
      const data = await fetchJson<WeeklyReport>('/api/library/report/weekly')
      setReport(data)
    } catch (err) {
      setReportError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setReportLoading(false)
    }
  }, [])

  const loadOffers = useCallback(async () => {
    setOffersLoading(true)
    setOffersError(null)
    try {
      const data = await fetchJson<Offer[]>('/api/library/offers')
      setOffers(Array.isArray(data) ? data : [])
    } catch (err) {
      setOffersError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setOffersLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadReport()
    void loadOffers()
  }, [loadReport, loadOffers])

  const refresh = () => {
    void loadReport()
    void loadOffers()
  }

  const updateForm = (patch: Partial<OfferFormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
  }

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...EMPTY_OFFER_FORM })
    setDialogError(null)
    setDialogOpen(true)
  }

  const openEdit = (offer: Offer) => {
    setEditingId(offer.id)
    setForm({
      company: offer.company || '',
      position: offer.position || '',
      salary_min: offer.salary_min == null ? '' : String(offer.salary_min),
      salary_max: offer.salary_max == null ? '' : String(offer.salary_max),
      salary_note: offer.salary_note || '',
      city: offer.city || '',
      commute: offer.commute || '',
      pros: offer.pros || '',
      cons: offer.cons || '',
      status: isOfferStatus(offer.status) ? offer.status : 'pending',
    })
    setDialogError(null)
    setDialogOpen(true)
  }

  const closeDialog = () => {
    if (saving) return
    setDialogOpen(false)
    setDialogError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const company = form.company.trim()
    if (!company) {
      setDialogError('请填写公司名称')
      return
    }
    setSaving(true)
    setDialogError(null)
    setNotice(null)
    try {
      const payload = {
        company,
        position: form.position.trim(),
        salary_min: parseAmount(form.salary_min),
        salary_max: parseAmount(form.salary_max),
        salary_note: form.salary_note.trim(),
        city: form.city.trim(),
        commute: form.commute.trim(),
        pros: form.pros,
        cons: form.cons,
        status: form.status,
      }
      const url = editingId == null ? '/api/library/offers' : `/api/library/offers/${editingId}`
      await fetchJson<{ ok: boolean; id?: number }>(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      setDialogOpen(false)
      setNotice(editingId == null ? 'Offer 已添加' : 'Offer 已更新')
      await loadOffers()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (offer: Offer) => {
    if (!window.confirm(`确认删除「${offer.company || '未命名公司'}」的 Offer 吗？`)) return
    setDeletingId(offer.id)
    setOffersError(null)
    setNotice(null)
    try {
      await fetchJson<{ ok: boolean }>(`/api/library/offers/${offer.id}/delete`, { method: 'POST' })
      setNotice('Offer 已删除')
      await loadOffers()
    } catch (err) {
      setOffersError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setDeletingId(null)
    }
  }

  const statItems = report
    ? [
        { label: '累计岗位', value: report.total_jobs },
        { label: '已投递', value: report.applied },
        { label: '匹配（≥60）', value: report.matched_60plus },
        { label: '平均分', value: report.avg_score ?? '—' },
        { label: '面试数', value: report.interviews },
        { label: 'Offer 数', value: report.offers },
      ]
    : []

  const maxStatusCount = report
    ? Math.max(1, ...JOB_STATUS_META.map(item => report.by_status?.[item.key] ?? 0))
    : 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-black text-foreground">求职管理</h1>
        <p className="mt-1 text-xs text-muted">查看求职周报，集中管理并对比已有 Offer。</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            求职周报
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={refresh}
            disabled={reportLoading || offersLoading}
          >
            {reportLoading || offersLoading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
            )}
            刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {reportError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{reportError}</p>
          )}

          {reportLoading && !report && (
            <div className="flex items-center justify-center py-10 text-xs text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在加载周报...
            </div>
          )}

          {!reportLoading && !report && !reportError && (
            <p className="py-8 text-center text-xs text-muted">暂无周报数据</p>
          )}

          {report && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {statItems.map(item => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-card-border bg-surface p-4"
                  >
                    <div className="text-2xl font-black text-foreground">{item.value}</div>
                    <div className="mt-1 text-xs text-muted">{item.label}</div>
                  </div>
                ))}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-black text-foreground">状态分布</h3>
                <div className="space-y-2">
                  {JOB_STATUS_META.map(item => {
                    const count = report.by_status?.[item.key] ?? 0
                    const width = count > 0 ? Math.max(4, (count / maxStatusCount) * 100) : 0
                    return (
                      <div key={item.key} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 text-xs text-muted">{item.label}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                          <div
                            className={`h-full rounded-full ${item.barClass}`}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-xs font-black text-foreground">
                          {count}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-black text-foreground">最近面试</h3>
                {report.recent_interviews.length === 0 ? (
                  <p className="rounded-xl border border-card-border bg-surface px-3 py-4 text-center text-xs text-muted">
                    暂无面试记录
                  </p>
                ) : (
                  <div className="divide-y divide-card-border overflow-hidden rounded-xl border border-card-border">
                    {report.recent_interviews.map(interview => (
                      <div
                        key={interview.id}
                        className="flex flex-wrap items-center justify-between gap-2 bg-card px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-black text-foreground">
                            {interview.company || '未填写公司'}
                            {interview.position ? ` · ${interview.position}` : ''}
                          </div>
                          <div className="mt-0.5 text-[11px] text-muted">
                            {interview.interview_date || '日期未填写'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted">
                            自评 {interview.self_score == null ? '未评分' : `${interview.self_score} 分`}
                          </span>
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-primary">
                            {INTERVIEW_STATUS_LABELS[interview.status] ?? (interview.status || '未知')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-black text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Offer 对比
            </h2>
            <p className="mt-1 text-xs text-muted">把多个 Offer 放在一起看薪资、通勤与优缺点。</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-1 h-4 w-4" />
            添加 Offer
          </Button>
        </div>

        {notice && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">{notice}</p>
        )}
        {offersError && (
          <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{offersError}</p>
        )}

        {offersLoading && offers.length === 0 && (
          <div className="flex items-center justify-center rounded-2xl border border-card-border bg-card py-10 text-xs text-muted">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            正在加载 Offer...
          </div>
        )}

        {!offersLoading && offers.length === 0 && !offersError && (
          <div className="rounded-2xl border border-dashed border-card-border bg-card px-4 py-10 text-center text-xs text-muted">
            还没有 Offer，点击「添加 Offer」记录下来做对比。
          </div>
        )}

        {offers.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {offers.map(offer => {
              const statusMeta = offerStatusMeta(offer.status)
              return (
                <Card key={offer.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-black text-foreground">
                          {offer.company || '未填写公司'}
                          {offer.position ? ` · ${offer.position}` : ''}
                        </CardTitle>
                        <p className="mt-1 text-xs font-bold text-primary">
                          薪资：{formatSalary(offer)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-surface px-2.5 py-2">
                        <span className="text-muted">城市：</span>
                        <span className="font-bold text-foreground">{offer.city || '—'}</span>
                      </div>
                      <div className="rounded-lg bg-surface px-2.5 py-2">
                        <span className="text-muted">通勤：</span>
                        <span className="font-bold text-foreground">{offer.commute || '—'}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-black text-success">优势</div>
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted">
                        {offer.pros || '未填写'}
                      </p>
                    </div>

                    <div>
                      <div className="text-xs font-black text-danger">顾虑</div>
                      <p className="mt-1 whitespace-pre-line text-xs leading-5 text-muted">
                        {offer.cons || '未填写'}
                      </p>
                    </div>

                    <div className="mt-auto flex justify-end gap-2 pt-1">
                      <Button variant="secondary" size="sm" onClick={() => openEdit(offer)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-soft hover:text-danger"
                        onClick={() => void handleDelete(offer)}
                        disabled={deletingId === offer.id}
                      >
                        {deletingId === offer.id ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                        )}
                        删除
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title={editingId == null ? '添加 Offer' : '编辑 Offer'}
        wide
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className={FIELD_LABEL_CLASS}>公司</span>
              <Input
                value={form.company}
                onChange={event => updateForm({ company: event.target.value })}
                placeholder="公司名称"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>职位</span>
              <Input
                value={form.position}
                onChange={event => updateForm({ position: event.target.value })}
                placeholder="职位名称"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>薪资下限</span>
              <Input
                type="number"
                step="any"
                value={form.salary_min}
                onChange={event => updateForm({ salary_min: event.target.value })}
                placeholder="如 12"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>薪资上限</span>
              <Input
                type="number"
                step="any"
                value={form.salary_max}
                onChange={event => updateForm({ salary_max: event.target.value })}
                placeholder="如 15"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>薪资备注</span>
              <Input
                value={form.salary_note}
                onChange={event => updateForm({ salary_note: event.target.value })}
                placeholder="如 14 薪、年终奖"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>状态</span>
              <Select
                value={form.status}
                onChange={event => updateForm({ status: event.target.value as OfferStatus })}
              >
                <option value="pending">待定</option>
                <option value="accepted">已接受</option>
                <option value="rejected">已拒绝</option>
              </Select>
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>城市</span>
              <Input
                value={form.city}
                onChange={event => updateForm({ city: event.target.value })}
                placeholder="工作城市"
              />
            </label>
            <label>
              <span className={FIELD_LABEL_CLASS}>通勤</span>
              <Input
                value={form.commute}
                onChange={event => updateForm({ commute: event.target.value })}
                placeholder="如 地铁 30 分钟"
              />
            </label>
          </div>

          <label className="block">
            <span className={FIELD_LABEL_CLASS}>优势</span>
            <Textarea
              rows={3}
              value={form.pros}
              onChange={event => updateForm({ pros: event.target.value })}
              placeholder="每行一条，如：薪资满意"
            />
          </label>
          <label className="block">
            <span className={FIELD_LABEL_CLASS}>顾虑</span>
            <Textarea
              rows={3}
              value={form.cons}
              onChange={event => updateForm({ cons: event.target.value })}
              placeholder="每行一条，如：通勤较远"
            />
          </label>

          {dialogError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{dialogError}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={closeDialog} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {saving ? '保存中' : '保存'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
