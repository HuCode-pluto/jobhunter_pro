import { Input } from '@/components/ui/input'
import { TagsInput } from '@/components/ui/tags-input'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

export interface RoleConfig {
  name: string
  keywords: string[]
  cities: string[]
  salary_min: number
  exclude_keywords: string[]
}

interface RolesEditorProps {
  value: RoleConfig[]
  onChange: (roles: RoleConfig[]) => void
}

const EMPTY_ROLE = (): RoleConfig => ({
  name: '',
  keywords: [],
  cities: [],
  salary_min: 0,
  exclude_keywords: [],
})

/** 目标岗位方向编辑器（手动流水线 job_preferences.roles）。 */
export function RolesEditor({ value, onChange }: RolesEditorProps) {
  const roles = Array.isArray(value) ? value : []

  const update = (index: number, patch: Partial<RoleConfig>) => {
    const next = roles.map((r, i) => (i === index ? { ...r, ...patch } : r))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      {roles.length === 0 && (
        <div className="rounded-lg border border-card-border bg-surface p-3 text-xs text-muted">
          尚未配置目标方向。添加后，手动粘贴的 JD 会按关键词归类到对应方向，并按城市/薪资/排除词做硬条件过滤。
        </div>
      )}
      {roles.map((role, index) => (
        <div key={index} className="rounded-lg border border-card-border bg-surface p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Input
              className="flex-1"
              placeholder="方向名称（如 系统运维工程师）"
              value={role.name}
              onChange={(e) => update(index, { name: e.target.value })}
            />
            <Button
              variant="ghost"
              className="h-8 w-8 p-0 text-muted hover:text-danger"
              onClick={() => onChange(roles.filter((_, i) => i !== index))}
              aria-label="删除方向"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs text-foreground">关键词（JD 命中即归入此方向）</div>
              <TagsInput
                value={role.keywords ?? []}
                onChange={(keywords) => update(index, { keywords })}
                placeholder="如 运维、Linux、实施"
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs text-foreground">期望城市</div>
              <TagsInput
                value={role.cities ?? []}
                onChange={(cities) => update(index, { cities })}
                placeholder="如 上海、北京、远程"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs text-foreground">期望月薪下限（元，0=不限）</div>
              <Input
                type="number"
                min={0}
                value={role.salary_min || 0}
                onChange={(e) => update(index, { salary_min: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs text-foreground">一票否决词</div>
              <TagsInput
                value={role.exclude_keywords ?? []}
                onChange={(exclude_keywords) => update(index, { exclude_keywords })}
                placeholder="如 外包、996、驻场"
              />
            </div>
          </div>
        </div>
      ))}
      <Button variant="secondary" className="h-8 text-xs" onClick={() => onChange([...roles, EMPTY_ROLE()])}>
        <Plus className="h-3.5 w-3.5" />
        添加方向
      </Button>
    </div>
  )
}
