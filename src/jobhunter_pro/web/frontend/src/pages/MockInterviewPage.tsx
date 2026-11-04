import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, Loader2, MessageSquare, RotateCcw, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface MockConfigResponse {
  job_preferences?: {
    roles?: unknown
  } | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface MockResponse {
  id?: unknown
  reply?: unknown
  finished?: unknown
  history?: unknown
}

interface MockSession {
  id: number
  role: string
  jobId: string
}

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error || '请求失败')
  return data
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '请求失败'
}

function readRoleNames(data: MockConfigResponse): string[] {
  const rawRoles = data.job_preferences?.roles
  if (!Array.isArray(rawRoles)) return []
  const names: string[] = []
  for (const item of rawRoles) {
    if (!item || typeof item !== 'object') continue
    const rawName = (item as Record<string, unknown>).name
    if (typeof rawName !== 'string') continue
    const name = rawName.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

function normalizeMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  const messages: ChatMessage[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null
    const content = typeof record.content === 'string' ? record.content : ''
    if (!role || !content.trim()) continue
    messages.push({ role, content })
  }
  return messages
}

export default function MockInterviewPage() {
  const [roles, setRoles] = useState<string[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [rolesError, setRolesError] = useState('')
  const [role, setRole] = useState('技术')
  const [jobId, setJobId] = useState('')
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState('')
  const [session, setSession] = useState<MockSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [finished, setFinished] = useState(false)
  const [answer, setAnswer] = useState('')
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const effectiveRole = roles.includes(role) ? role : roles[0] || '技术'
  const roleOptions = roles.length ? roles : ['技术']

  useEffect(() => {
    let cancelled = false
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' })
        const data = await readJson<MockConfigResponse>(res)
        if (!cancelled) setRoles(readRoleNames(data))
      } catch (error) {
        if (!cancelled) setRolesError(getErrorMessage(error))
      } finally {
        if (!cancelled) setRolesLoading(false)
      }
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, sending, finished])

  const handleStart = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (starting) return
    const trimmedJobId = jobId.trim()
    if (trimmedJobId && !/^\d+$/.test(trimmedJobId)) {
      setStartError('关联岗位 ID 需为正整数')
      return
    }

    setStarting(true)
    setStartError('')
    try {
      const payload: { role: string; job_id?: number } = { role: effectiveRole }
      if (trimmedJobId) {
        const parsedJobId = Number(trimmedJobId)
        if (!Number.isSafeInteger(parsedJobId) || parsedJobId <= 0) throw new Error('关联岗位 ID 需为正整数')
        payload.job_id = parsedJobId
      }

      const res = await fetch('/api/library/mock/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })
      const data = await readJson<MockResponse>(res)
      const history = normalizeMessages(data.history)
      const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
      if (!history.length && reply) history.push({ role: 'assistant', content: reply })
      if (!history.length) throw new Error('面试官未返回开场内容')
      const sessionId = typeof data.id === 'number' ? data.id : Number(data.id)
      if (!Number.isInteger(sessionId) || sessionId <= 0) throw new Error('面试会话创建失败')

      setSession({ id: sessionId, role: effectiveRole, jobId: trimmedJobId })
      setMessages(history)
      setFinished(data.finished === true)
      setAnswer('')
      setChatError('')
    } catch (error) {
      setStartError(getErrorMessage(error))
    } finally {
      setStarting(false)
    }
  }

  const handleAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session || sending || finished) return
    const trimmedAnswer = answer.trim()
    if (!trimmedAnswer) return

    const previousMessages = messages
    const userMessage: ChatMessage = { role: 'user', content: trimmedAnswer }
    setMessages([...previousMessages, userMessage])
    setAnswer('')
    setSending(true)
    setChatError('')

    try {
      const res = await fetch('/api/library/mock/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: session.id, answer: trimmedAnswer }),
        cache: 'no-store',
      })
      const data = await readJson<MockResponse>(res)
      const history = normalizeMessages(data.history)
      const reply = typeof data.reply === 'string' ? data.reply.trim() : ''
      if (history.length) {
        setMessages(history)
      } else if (reply) {
        setMessages([...previousMessages, userMessage, { role: 'assistant', content: reply }])
      } else {
        throw new Error('面试官未返回回复')
      }
      setFinished(data.finished === true)
    } catch (error) {
      setMessages(previousMessages)
      setAnswer(trimmedAnswer)
      setChatError(getErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  const handleRestart = () => {
    setSession(null)
    setMessages([])
    setFinished(false)
    setAnswer('')
    setChatError('')
    setStartError('')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-primary">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">模拟面试</h1>
          <p className="mt-1 text-sm text-muted">与 AI 面试官进行一轮文字模拟，练习表达并获取即时点评。</p>
        </div>
      </header>

      {!session ? (
        <Card className="mx-auto max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-black text-foreground">开始一场模拟面试</CardTitle>
                <p className="mt-1 text-xs leading-5 text-muted">面试官会从易到难提问，并在每轮作答后给出简短点评。</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleStart}>
              <label className="block space-y-1.5 text-xs font-bold text-muted">
                <span>岗位方向</span>
                <Select value={effectiveRole} onChange={event => setRole(event.target.value)} disabled={rolesLoading}>
                  {rolesLoading ? (
                    <option value={effectiveRole}>加载岗位方向...</option>
                  ) : (
                    roleOptions.map(name => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))
                  )}
                </Select>
              </label>

              <label className="block space-y-1.5 text-xs font-bold text-muted">
                <span>关联岗位 ID（可选）</span>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={jobId}
                  onChange={event => setJobId(event.target.value)}
                  placeholder="如：12，留空则按岗位方向提问"
                />
              </label>

              {!rolesLoading && !rolesError && roles.length === 0 && (
                <p className="rounded-lg border border-card-border bg-surface px-3 py-2 text-xs text-muted">
                  尚未配置岗位方向，将使用默认「技术」。
                </p>
              )}
              {rolesError && (
                <p className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
                  岗位方向读取失败，将使用默认「技术」：{rolesError}
                </p>
              )}
              {startError && (
                <p role="alert" className="rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
                  {startError}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={starting || rolesLoading}>
                {starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Bot className="mr-1.5 h-4 w-4" />}
                {starting ? '正在准备面试...' : '开始面试'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex h-[calc(100vh-200px)] min-h-[520px] flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-card-border px-4 py-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-sm font-black text-foreground">{session.role} · 模拟面试</CardTitle>
              <p className="mt-1 truncate text-xs text-muted">
                {session.jobId ? `关联岗位 #${session.jobId}` : '未关联具体岗位，按岗位方向提问'}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                finished ? 'border-success-border bg-success-soft text-success' : 'border-info-border bg-info-soft text-info'
              }`}
            >
              {finished ? '已结束' : '进行中'}
            </span>
          </CardHeader>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[85%] p-3 text-sm ${
                  message.role === 'assistant'
                    ? 'rounded-2xl rounded-tl-sm border border-card-border bg-surface text-foreground'
                    : 'ml-auto rounded-2xl rounded-tr-sm bg-primary/10 text-foreground'
                }`}
              >
                <div className={`mb-1 text-[11px] font-bold ${message.role === 'assistant' ? 'text-info' : 'text-primary'}`}>
                  {message.role === 'assistant' ? '面试官' : '我'}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
              </div>
            ))}

            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                面试官正在思考...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form className="border-t border-card-border p-3" onSubmit={handleAnswer}>
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                value={answer}
                onChange={event => setAnswer(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                disabled={sending || finished}
                placeholder={finished ? '本次面试已结束' : '输入你的回答...'}
                className="min-h-[64px] resize-none leading-6"
              />
              <Button
                type="submit"
                className="h-[64px] shrink-0 px-4"
                disabled={sending || finished || !answer.trim()}
              >
                {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                {sending ? '发送中' : '发送'}
              </Button>
            </div>

            {!finished && <p className="mt-1.5 text-[11px] text-muted">Enter 发送，Shift + Enter 换行</p>}

            {chatError && (
              <p role="alert" className="mt-2 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger">
                {chatError}
              </p>
            )}

            {finished && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success-border bg-success-soft px-3 py-2">
                <p className="text-xs font-bold text-success">本次模拟面试已结束。</p>
                <Button type="button" variant="secondary" size="sm" onClick={handleRestart}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  重新开始
                </Button>
              </div>
            )}
          </form>
        </Card>
      )}
    </div>
  )
}
