import { cn } from '@/lib/utils'
import { ReactNode, useState } from 'react'

export interface TabsProps {
  tabs: { key: string; label: string; content: ReactNode }[]
  className?: string
}

/** 简易标签页：切换内容，激活态沿用 primary 高亮风格。 */
export function Tabs({ tabs, className }: TabsProps) {
  const [active, setActive] = useState(tabs[0]?.key ?? '')
  const current = tabs.find((t) => t.key === active) ?? tabs[0]
  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap gap-1 rounded-xl border border-card-border bg-surface p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              tab.key === current?.key
                ? 'bg-secondary text-primary font-black'
                : 'text-muted hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{current?.content}</div>
    </div>
  )
}
