import { useEffect, useRef, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLATFORM_LABELS } from '@/lib/platforms'
import { cn } from '@/lib/utils'

const LOGIN_PLATFORMS = ['boss', 'zhilian', '51job', 'liepin'] as const
type LoginPlatform = (typeof LOGIN_PLATFORMS)[number]

export function QuickActions({ onNotice }: { onNotice?: (message: string) => void }) {
  const [restarting, setRestarting] = useState(false)
  const [opening, setOpening] = useState<LoginPlatform | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const pollTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current)
  }, [])

  const notify = (text: string) => {
    setMessage(text)
    onNotice?.(text)
  }

  const openLogin = async (platform: LoginPlatform) => {
    setOpening(platform)
    setError('')
    try {
      const res = await fetch('/api/browser/open-platform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '打开登录页失败')
      notify(`已在专用 Chrome 中打开 ${PLATFORM_LABELS[platform]}，请在该窗口完成登录。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '打开登录页失败')
    } finally {
      setOpening(null)
    }
  }

  const restartProject = async () => {
    const confirmed = window.confirm(
      '重启会中断正在运行的采集/评分任务，但不会删除已入库的数据。确定重启？',
    )
    if (!confirmed) {
      return
    }
    setRestarting(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch('/api/system/restart', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '重启失败')
      notify(data.message || '服务正在重启…')
      const deadline = Date.now() + 30000
      const poll = async () => {
        try {
          const health = await fetch('/api/health', { cache: 'no-store' })
          if (health.ok) {
            window.location.reload()
            return
          }
        } catch {
          // 服务重启期间请求失败是预期行为，继续轮询。
        }
        if (Date.now() >= deadline) {
          setRestarting(false)
          setError('重启超时，请刷新页面或检查面板服务状态。')
          return
        }
        pollTimer.current = window.setTimeout(() => void poll(), 1000)
      }
      pollTimer.current = window.setTimeout(() => void poll(), 1500)
    } catch (cause) {
      setRestarting(false)
      setError(cause instanceof Error ? cause.message : '重启失败')
    }
  }

  return (
    <section className="rounded-2xl border border-card-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">快捷操作</h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            登录按钮会在专用 Chrome 窗口打开官网；如果专用 Chrome 未运行，会自动启动。
            项目重启只重载本地服务，不删除已入库的数据。
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void restartProject()} disabled={restarting}>
          <RefreshCw className={cn('mr-1 h-4 w-4', restarting && 'animate-spin')} />
          {restarting ? '等待服务恢复…' : '项目重启'}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {LOGIN_PLATFORMS.map(platform => (
          <Button
            key={platform}
            variant="secondary"
            size="sm"
            onClick={() => void openLogin(platform)}
            disabled={restarting || opening !== null}
          >
            <ExternalLink className="mr-1 h-4 w-4" />
            {opening === platform ? '打开中…' : `登录 ${PLATFORM_LABELS[platform]}`}
          </Button>
        ))}
      </div>
      {message && (
        <p role="status" className="mt-3 rounded-xl bg-secondary px-3 py-2 text-xs text-primary">{message}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-danger-border bg-danger-soft px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}
    </section>
  )
}
