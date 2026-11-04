import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Image as ImageIcon, Link as LinkIcon, Loader2, Sparkles } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Tabs } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { readImageResized } from '@/lib/screenshot'
import { cn } from '@/lib/utils'

interface ManualJobResult {
  job_id?: number
  role?: string
  score?: number | null
  summary?: string
  missing?: string[]
  note?: string
  reasons?: string[]
  tailored?: boolean
  tailor_error?: string
  error?: string
}

interface ManualJobResponse {
  ok: boolean
  count: number
  errors: number
  results: ManualJobResult[]
}

interface AddJobDialogProps {
  open: boolean
  onClose: () => void
  onAdded?: () => void
}

function countJdChunks(text: string): number {
  if (!text.trim()) return 0
  return text
    .split(/\n\s*={3,}\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean).length
}

export function AddJobDialog({ open, onClose, onAdded }: AddJobDialogProps) {
  const [manualText, setManualText] = useState('')
  const [manualUrl, setManualUrl] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkText, setLinkText] = useState('')
  const [imageName, setImageName] = useState('')
  const [results, setResults] = useState<ManualJobResponse | null>(null)
  const [submitError, setSubmitError] = useState('')
  const [recognizeError, setRecognizeError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [recognizing, setRecognizing] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    setManualText('')
    setManualUrl('')
    setOcrText('')
    setLinkUrl('')
    setLinkText('')
    setImageName('')
    setResults(null)
    setSubmitError('')
    setRecognizeError('')
    setLinkError('')
    setSubmitting(false)
    setRecognizing(false)
    setExtracting(false)
  }, [open])

  const submitManual = async (text: string, url: string) => {
    const content = text.trim()
    if (content.length < 20) {
      setSubmitError('JD 内容太短，请粘贴完整岗位描述（每条不少于 20 字）')
      return
    }
    setSubmitting(true)
    setSubmitError('')
    setResults(null)
    try {
      const res = await fetch('/api/library/jobs/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jd_text: content, url: url.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '提交失败')
      const resultList: ManualJobResult[] = Array.isArray(data.results)
        ? (data.results as ManualJobResult[])
        : []
      const payload: ManualJobResponse = {
        ok: Boolean(data.ok),
        count: typeof data.count === 'number' ? data.count : resultList.length,
        errors:
          typeof data.errors === 'number'
            ? data.errors
            : resultList.filter((item) => item.error).length,
        results: resultList,
      }
      setResults(payload)
      if (payload.results.some((item) => typeof item.job_id === 'number')) onAdded?.()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleScreenshotFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setImageName(file.name)
    setRecognizeError('')
    setSubmitError('')
    setResults(null)
    setOcrText('')
    setRecognizing(true)
    try {
      const base64 = await readImageResized(file)
      const res = await fetch('/api/library/jobs/screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, mime: 'image/jpeg' }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '截图识别失败')
      const text = String(data.text || '')
      if (!text.trim()) throw new Error('截图识别结果为空，请换一张更清晰的图片')
      setOcrText(text)
    } catch (err) {
      setRecognizeError(err instanceof Error ? err.message : '截图识别失败')
    } finally {
      setRecognizing(false)
    }
  }

  const recognizeLink = async () => {
    const url = linkUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      setLinkError('请输入完整链接（http/https 开头）')
      return
    }
    setExtracting(true)
    setLinkError('')
    setSubmitError('')
    setResults(null)
    setLinkText('')
    try {
      const res = await fetch('/api/library/jobs/fetch-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '链接提取失败')
      const text = String(data.text || '')
      if (!text.trim()) throw new Error('提取结果为空，请确认链接可正常访问')
      setLinkText(text)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : '链接提取失败')
    } finally {
      setExtracting(false)
    }
  }

  const pasteCount = countJdChunks(manualText)
  const failedCount = results
    ? results.errors || results.results.filter((item) => item.error).length
    : 0
  const successCount = results ? Math.max(results.count - failedCount, 0) : 0

  const pasteTab = (
    <div className="space-y-3">
      <Textarea
        value={manualText}
        onChange={(e) => setManualText(e.target.value)}
        rows={8}
        placeholder={'粘贴完整岗位描述，包含职责与任职要求。\n\n批量粘贴时，多条 JD 之间用一行 ====== 分隔。'}
        className="min-h-[180px]"
      />
      <Input
        value={manualUrl}
        onChange={(e) => setManualUrl(e.target.value)}
        placeholder="原始链接（可选，便于回看岗位）"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          {pasteCount > 1
            ? `已识别 ${pasteCount} 条 JD${pasteCount > 10 ? '，本次仅处理前 10 条' : ''}`
            : '单次最多 10 条，每条不少于 20 字'}
        </span>
        <Button
          type="button"
          size="sm"
          onClick={() => void submitManual(manualText, manualUrl)}
          disabled={submitting}
        >
          {submitting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {submitting ? '正在解析…' : '解析并入库'}
        </Button>
      </div>
    </div>
  )

  const screenshotTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-card-border bg-surface p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleScreenshotFile(e)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={recognizing}
        >
          {recognizing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="mr-1.5 h-4 w-4" />
          )}
          {recognizing ? '正在识别…' : '选择截图'}
        </Button>
        <span className="text-xs text-muted">
          {imageName || '支持常见图片格式，上传后自动压缩并识别'}
        </span>
      </div>
      {recognizeError && (
        <div className="rounded-lg px-3 py-2 text-xs bg-danger-soft text-danger">{recognizeError}</div>
      )}
      <Textarea
        value={ocrText}
        onChange={(e) => setOcrText(e.target.value)}
        rows={8}
        placeholder="截图识别结果会显示在这里，可手动修改后提交。"
        className="min-h-[180px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">识别结果可编辑，提交前请确认岗位信息完整。</span>
        <Button
          type="button"
          size="sm"
          onClick={() => void submitManual(ocrText, '')}
          disabled={submitting || recognizing || !ocrText.trim()}
        >
          {submitting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {submitting ? '正在解析…' : '解析并入库'}
        </Button>
      </div>
    </div>
  )

  const linkTab = (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://... 招聘详情页链接"
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void recognizeLink()}
          disabled={extracting}
        >
          {extracting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <LinkIcon className="mr-1.5 h-4 w-4" />
          )}
          {extracting ? '提取中…' : '提取 JD'}
        </Button>
      </div>
      {linkError && <div className="rounded-lg px-3 py-2 text-xs bg-danger-soft text-danger">{linkError}</div>}
      <Textarea
        value={linkText}
        onChange={(e) => setLinkText(e.target.value)}
        rows={8}
        placeholder="链接提取结果会显示在这里，可手动修改后提交。"
        className="min-h-[180px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">若链接需要登录，提取可能失败，可改用截图识别或手动粘贴。</span>
        <Button
          type="button"
          size="sm"
          onClick={() => void submitManual(linkText, linkUrl)}
          disabled={submitting || extracting || !linkText.trim()}
        >
          {submitting ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {submitting ? '正在解析…' : '解析并入库'}
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onClose={onClose} title="添加岗位" wide>
      <div className="space-y-4">
        <p className="text-xs leading-6 text-muted">
          粘贴 JD 文本、上传截图或输入招聘链接，AI 会自动解析岗位并评分；批量粘贴时每条之间用一行
          ====== 分隔，单次最多 10 条。
        </p>

        <Tabs
          tabs={[
            { key: 'paste', label: '粘贴 JD', content: pasteTab },
            { key: 'screenshot', label: '截图识别', content: screenshotTab },
            { key: 'link', label: '链接提取', content: linkTab },
          ]}
        />

        {submitError && (
          <div className="rounded-lg px-3 py-2 text-xs bg-danger-soft text-danger">{submitError}</div>
        )}

        {results && (
          <div className="space-y-2">
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-xs',
                failedCount ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success',
              )}
            >
              本次提交 {results.count} 条，成功 {successCount} 条
              {failedCount ? `，失败 ${failedCount} 条` : ''}。
              {successCount > 0 ? '结果已写入岗位库。' : ''}
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {results.results.map((item, index) => (
                <div
                  key={item.job_id != null ? `job-${item.job_id}` : `result-${index}`}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-xs',
                    item.error
                      ? 'border-danger-border bg-danger-soft text-danger'
                      : 'border-card-border bg-surface text-foreground',
                  )}
                >
                  {item.error ? (
                    <p>
                      <span className="font-bold">第 {index + 1} 条：</span>
                      {item.error}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>#{item.job_id ?? '—'}</span>
                        <span>{item.role || '未识别方向'}</span>
                        <span className="text-primary">评分 {item.score ?? '—'}</span>
                        {item.tailored && <span className="text-success">已定制材料</span>}
                        {item.reasons?.length ? <span className="text-danger">已排除</span> : null}
                      </div>
                      {item.summary && <p className="leading-5 text-muted">{item.summary}</p>}
                      {item.note && <p className="leading-5 text-warning">{item.note}</p>}
                      {item.reasons?.length ? (
                        <p className="text-danger">排除原因：{item.reasons.join('；')}</p>
                      ) : null}
                      {item.missing?.length ? (
                        <p className="text-muted">技能缺口：{item.missing.join('、')}</p>
                      ) : null}
                      {item.tailor_error && (
                        <p className="text-warning">定制失败：{item.tailor_error}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export default AddJobDialog
