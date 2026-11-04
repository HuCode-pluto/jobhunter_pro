import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, Copy, Loader2, Map, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { copyToClipboard } from '@/lib/clipboard'

type CopyKind = 'map' | 'plan'

interface ConfigResponse {
  job_preferences?: {
    roles?: Array<{ name?: unknown } | null> | null
  } | null
}

interface SkillMapResult {
  markdown: string
  html: string
  path: string
}

interface CopyFeedback {
  kind: CopyKind
  text: string
  error?: boolean
}

const MARKDOWN_CLASSES =
  '[&_h1]:text-lg [&_h1]:font-black [&_h2]:text-sm [&_h2]:font-black [&_h2]:mt-4 [&_h3]:text-xs [&_h3]:font-bold [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_td]:border-t [&_th]:border-b [&_th]:py-1 [&_td]:py-1 [&_li]:text-xs [&_p]:text-xs [&_a]:text-primary'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || '请求失败')
  }
  return data as T
}

function readRoleNames(data: ConfigResponse): string[] {
  const roles = data.job_preferences?.roles
  if (!Array.isArray(roles)) return []
  const names = roles.map(item => {
    if (!item || typeof item !== 'object') return ''
    return typeof item.name === 'string' ? item.name.trim() : ''
  })
  return Array.from(new Set(names.filter(Boolean)))
}

function normalizeTop(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return 40
  return Math.min(100, Math.max(5, parsed))
}

export default function SkillMapPage() {
  const [roles, setRoles] = useState<string[]>([])
  const [role, setRole] = useState('')
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState<string | null>(null)

  const [topN, setTopN] = useState('40')
  const [withLlm, setWithLlm] = useState(false)

  const [mapResult, setMapResult] = useState<SkillMapResult | null>(null)
  const [mapLoading, setMapLoading] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const [planResult, setPlanResult] = useState<SkillMapResult | null>(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [planError, setPlanError] = useState<string | null>(null)

  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null)
  const copyTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const loadRoles = async () => {
      setRolesLoading(true)
      setRolesError(null)
      try {
        const data = await fetchJson<ConfigResponse>('/api/config')
        if (cancelled) return
        const names = readRoleNames(data)
        setRoles(names)
        setRole(prev => (prev && names.includes(prev) ? prev : names[0] ?? ''))
      } catch (err) {
        if (!cancelled) {
          setRolesError(err instanceof Error ? err.message : '请求失败')
        }
      } finally {
        if (!cancelled) setRolesLoading(false)
      }
    }
    void loadRoles()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    },
    []
  )

  const effectiveRole = role || roles[0] || ''
  const canGenerate = Boolean(effectiveRole) && !rolesLoading

  const handleRoleChange = (nextRole: string) => {
    setRole(nextRole)
    setMapResult(null)
    setMapError(null)
    setPlanResult(null)
    setPlanError(null)
    setCopyFeedback(null)
  }

  const generateMap = async () => {
    const targetRole = effectiveRole
    if (!targetRole) return
    setMapLoading(true)
    setMapError(null)
    setCopyFeedback(null)
    setMapResult(null)
    try {
      const params = new URLSearchParams({
        role: targetRole,
        top: String(normalizeTop(topN)),
      })
      if (withLlm) params.set('with_llm', 'true')
      const data = await fetchJson<SkillMapResult>(`/api/library/skillmap?${params.toString()}`)
      setMapResult({
        markdown: data.markdown ?? '',
        html: data.html ?? '',
        path: data.path ?? '',
      })
    } catch (err) {
      setMapError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setMapLoading(false)
    }
  }

  const generatePlan = async () => {
    const targetRole = effectiveRole
    if (!targetRole) return
    setPlanLoading(true)
    setPlanError(null)
    setCopyFeedback(null)
    setPlanResult(null)
    try {
      const data = await fetchJson<SkillMapResult>('/api/library/study-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: targetRole }),
      })
      setPlanResult({
        markdown: data.markdown ?? '',
        html: data.html ?? '',
        path: data.path ?? '',
      })
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : '请求失败')
    } finally {
      setPlanLoading(false)
    }
  }

  const handleCopy = async (kind: CopyKind, markdown: string) => {
    if (!markdown) return
    const ok = await copyToClipboard(markdown)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    if (ok) {
      setCopyFeedback({ kind, text: 'Markdown 已复制到剪贴板' })
    } else {
      setCopyFeedback({ kind, text: '复制失败，请手动选择文本复制', error: true })
    }
    copyTimer.current = window.setTimeout(() => setCopyFeedback(null), 2500)
  }

  const renderCopyFeedback = (kind: CopyKind) => {
    if (copyFeedback?.kind !== kind) return null
    return (
      <p
        className={`rounded-lg px-3 py-2 text-xs ${
          copyFeedback.error ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
        }`}
      >
        {copyFeedback.text}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-black text-foreground">技能地图</h1>
        <p className="mt-1 text-xs text-muted">
          聚合岗位库 JD 中的技能点，生成技能地图和 30 天学习计划。
        </p>
      </div>

      {rolesError && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{rolesError}</p>
      )}
      {!rolesLoading && !rolesError && roles.length === 0 && (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          未配置岗位方向，请到配置页添加
        </p>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-foreground">
            <Map className="h-4 w-4 text-primary" />
            技能地图
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleCopy('map', mapResult?.markdown ?? '')}
            disabled={!mapResult?.markdown}
          >
            {copyFeedback?.kind === 'map' && !copyFeedback.error ? (
              <Check className="mr-1 h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {copyFeedback?.kind === 'map' && !copyFeedback.error ? '已复制' : '复制 Markdown'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56">
              <label className="mb-1 block text-xs font-black text-foreground" htmlFor="skillmap-role">
                岗位方向
              </label>
              <Select
                id="skillmap-role"
                value={effectiveRole}
                onChange={event => handleRoleChange(event.target.value)}
                disabled={rolesLoading || roles.length === 0 || mapLoading || planLoading}
              >
                {roles.length === 0 ? (
                  <option value="">{rolesLoading ? '加载中...' : '暂无岗位方向'}</option>
                ) : (
                  roles.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <div className="w-28">
              <label className="mb-1 block text-xs font-black text-foreground" htmlFor="skillmap-top">
                Top-N
              </label>
              <Input
                id="skillmap-top"
                type="number"
                min={5}
                max={100}
                step={1}
                value={topN}
                onChange={event => setTopN(event.target.value)}
                onBlur={() => setTopN(String(normalizeTop(topN)))}
                disabled={mapLoading}
              />
            </div>

            <div className="flex items-center gap-2 pb-1.5">
              <Switch
                checked={withLlm}
                onChange={setWithLlm}
                disabled={mapLoading}
                aria-label="AI 学习建议"
              />
              <span className="flex items-center gap-1 text-xs font-bold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                AI 学习建议
              </span>
            </div>

            <Button
              className="sm:ml-1"
              onClick={() => void generateMap()}
              disabled={mapLoading || !canGenerate}
            >
              {mapLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Map className="mr-1 h-4 w-4" />
              )}
              {mapLoading ? '生成中' : '生成技能地图'}
            </Button>
          </div>

          {renderCopyFeedback('map')}
          {mapError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{mapError}</p>
          )}

          {mapLoading && (
            <div className="flex items-center justify-center rounded-xl border border-card-border bg-surface py-10 text-xs text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在生成技能地图...
            </div>
          )}

          {!mapLoading && mapResult && (
            mapResult.markdown ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-card-border bg-surface p-4">
                  <div
                    className={MARKDOWN_CLASSES}
                    dangerouslySetInnerHTML={{ __html: mapResult.html }}
                  />
                </div>
                {mapResult.path && (
                  <p className="break-all text-xs text-muted">生成文件：{mapResult.path}</p>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                技能库为空：先去岗位库添加一些 JD
              </p>
            )
          )}

          {!mapLoading && !mapResult && (
            <div className="rounded-xl border border-dashed border-card-border bg-surface px-4 py-10 text-center text-xs text-muted">
              选择岗位方向并点击「生成技能地图」查看结果
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-black text-foreground">
            <BookOpen className="h-4 w-4 text-primary" />
            学习计划
          </CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleCopy('plan', planResult?.markdown ?? '')}
            disabled={!planResult?.markdown}
          >
            {copyFeedback?.kind === 'plan' && !copyFeedback.error ? (
              <Check className="mr-1 h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="mr-1 h-3.5 w-3.5" />
            )}
            {copyFeedback?.kind === 'plan' && !copyFeedback.error ? '已复制' : '复制 Markdown'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-56">
              <label className="mb-1 block text-xs font-black text-foreground" htmlFor="study-plan-role">
                岗位方向
              </label>
              <Select
                id="study-plan-role"
                value={effectiveRole}
                onChange={event => handleRoleChange(event.target.value)}
                disabled={rolesLoading || roles.length === 0 || mapLoading || planLoading}
              >
                {roles.length === 0 ? (
                  <option value="">{rolesLoading ? '加载中...' : '暂无岗位方向'}</option>
                ) : (
                  roles.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))
                )}
              </Select>
            </div>

            <Button
              onClick={() => void generatePlan()}
              disabled={planLoading || !canGenerate}
            >
              {planLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              {planLoading ? '生成中...' : '生成 30 天学习计划'}
            </Button>
          </div>

          {renderCopyFeedback('plan')}
          {planError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{planError}</p>
          )}

          {planLoading && (
            <div className="flex items-center justify-center rounded-xl border border-card-border bg-surface py-10 text-xs text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              正在生成学习计划，请稍候...
            </div>
          )}

          {!planLoading && planResult && (
            planResult.markdown ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-card-border bg-surface p-4">
                  <div
                    className={MARKDOWN_CLASSES}
                    dangerouslySetInnerHTML={{ __html: planResult.html }}
                  />
                </div>
                {planResult.path && (
                  <p className="break-all text-xs text-muted">生成文件：{planResult.path}</p>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
                学习计划生成结果为空，请稍后重试
              </p>
            )
          )}

          {!planLoading && !planResult && (
            <div className="rounded-xl border border-dashed border-card-border bg-surface px-4 py-10 text-center text-xs text-muted">
              选择岗位方向并点击「生成 30 天学习计划」查看结果
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
