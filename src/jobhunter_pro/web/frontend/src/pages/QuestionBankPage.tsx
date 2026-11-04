import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Library, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface QuestionBankItem {
  id: number
  question: string
  role_type: string
  category: string
  frequency: number
  reference_answer: string
  source: string
}

interface RebuildResponse {
  ok: boolean
  count: number
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

export default function QuestionBankPage() {
  const [role, setRole] = useState('')
  const [questions, setQuestions] = useState<QuestionBankItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildMessage, setRebuildMessage] = useState('')
  const requestSeq = useRef(0)

  const loadQuestions = useCallback(async (roleValue: string) => {
    const seq = ++requestSeq.current
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ limit: '200' })
      if (roleValue) params.set('role', roleValue)
      const res = await fetch(`/api/library/question-bank?${params.toString()}`, { cache: 'no-store' })
      const data = await readJson<QuestionBankItem[]>(res)
      if (!Array.isArray(data)) throw new Error('题库数据格式异常')
      if (seq !== requestSeq.current) return
      setQuestions(data)
    } catch (loadError) {
      if (seq === requestSeq.current) setError(getErrorMessage(loadError))
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadQuestions(role.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [role, loadQuestions])

  const handleRebuild = async () => {
    if (!window.confirm('将重新聚合面试真题到题库（预测题会保留），确定重建吗？')) return
    setRebuilding(true)
    setError('')
    setRebuildMessage('')
    try {
      const res = await fetch('/api/library/question-bank/rebuild', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await readJson<RebuildResponse>(res)
      const count = typeof data.count === 'number' ? data.count : 0
      setRebuildMessage(`题库已重建，共 ${count} 道题。`)
      await loadQuestions(role.trim())
    } catch (rebuildError) {
      setError(getErrorMessage(rebuildError))
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">面试题库</h1>
          <p className="mt-1 text-sm text-muted">汇总真实面试题与预测题，按出现频次排序，随时回看高分参考答案。</p>
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-end">
          <label className="min-w-0 flex-1 space-y-1.5 text-xs font-bold text-muted">
            <span>岗位方向筛选</span>
            <Input
              value={role}
              onChange={event => setRole(event.target.value)}
              placeholder="输入岗位方向，如：运维工程师（留空查看全部）"
            />
          </label>
          <div className="flex items-center gap-3 md:h-9">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              共 {questions.length} 道题
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={rebuilding}
              onClick={() => void handleRebuild()}
            >
              {rebuilding ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {rebuilding ? '重建中...' : '重建题库'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {rebuildMessage && (
        <p role="status" className="rounded-lg border border-success-border bg-success-soft px-3 py-2 text-xs text-success">
          {rebuildMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}

      {loading && questions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          加载题库中...
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-card-border bg-surface px-5 py-12 text-center">
          <p className="text-sm font-bold text-foreground">
            {role.trim() ? `没有找到方向为「${role.trim()}」的题目` : '题库还是空的'}
          </p>
          <p className="mt-1 text-xs text-muted">
            {role.trim() ? '可以清空筛选查看全部题目，或换个岗位方向试试。' : '完成一次面试复盘，或点击「重建题库」聚合已有真题。'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map(item => (
            <Card key={item.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 break-words text-sm font-black leading-7 text-foreground">{item.question}</p>
                  <span className="shrink-0 rounded-full border border-card-border bg-surface px-2.5 py-0.5 text-[11px] font-bold text-muted">
                    出现 {item.frequency} 次
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full border border-info-border bg-info-soft px-2 py-0.5 text-[11px] font-bold text-info">
                    {item.category || '未分类'}
                  </span>
                  {item.role_type && (
                    <span className="inline-flex items-center rounded-full border border-card-border bg-surface px-2 py-0.5 text-[11px] font-bold text-muted">
                      {item.role_type}
                    </span>
                  )}
                  {item.source === 'prep' && (
                    <span className="inline-flex items-center rounded-full border border-purple-border bg-purple-soft px-2 py-0.5 text-[11px] font-bold text-purple">
                      预测
                    </span>
                  )}
                </div>

                <details className="group overflow-hidden rounded-xl border border-card-border bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-muted">
                    <span>参考答案</span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="border-t border-card-border px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">
                      {item.reference_answer || '暂无参考答案'}
                    </p>
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
