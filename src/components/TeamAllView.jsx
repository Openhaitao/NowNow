import { useMemo } from 'react'
import { LayoutList } from 'lucide-react'
import { inPeriod, periodRange } from '../lib/period'
import EntryRow from './EntryRow'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// 全部目标 = 全公司一页看清"每个人现在在干什么"：
// 按人分组，每人一块（今日/本周/本月 当前周期的目标 + 过期未完成的欠账）
export default function TeamAllView({ allEntries, profiles, me, mutate, pushUndo }) {
  const people = useMemo(() => {
    const active = profiles.filter((p) => p.status !== 'pending')
    // 自己排最前，其他人按名字
    return [...active.filter((p) => p.id === me.id), ...active.filter((p) => p.id !== me.id)]
  }, [profiles, me.id])

  const ranges = useMemo(
    () => Object.fromEntries(SECTIONS.map((s) => [s.key, periodRange(s.key, 0)])),
    [],
  )

  // 每人每区：当前周期的条目 + 锚定在过去但还没完成的目标（欠账，行内自带红底）
  const rowsFor = (pid, key) =>
    allEntries
      .filter((e) => e.owner === pid && e.section === key && e.status !== 'closed')
      .filter(
        (e) =>
          inPeriod(e.anchor ?? null, ranges[key]) ||
          (e.is_goal && e.anchor && new Date(e.anchor + 'T00:00:00') < ranges[key].start),
      )
      .sort((a, b) => a.position - b.position)

  const isPastDue = (e, key) =>
    e.is_goal && e.status === 'open' && e.anchor && new Date(e.anchor + 'T00:00:00') < ranges[key].start

  return (
    <div>
      <div className="mt-4 flex items-center gap-2 text-[15px] font-semibold">
        <LayoutList size={16} /> 全部目标
        <span className="text-[12px] font-normal text-stone-300">全员 · 每个人现在在干什么</span>
      </div>

      {people.map((p) => {
        const blocks = SECTIONS.map((sec) => ({ sec, rows: rowsFor(p.id, sec.key) })).filter(
          (b) => b.rows.length > 0,
        )
        const total = blocks.reduce((n, b) => n + b.rows.length, 0)
        return (
          <section key={p.id} className="border-b border-stone-100 py-5 last:border-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold">
                {p.display_name}
                {p.id === me.id ? '（我）' : ''}
              </span>
              <span className="text-xs text-stone-300">{total ? `${total} 条进行中` : '暂无进行中的目标'}</span>
            </div>
            {blocks.map(({ sec, rows }) => (
              <div key={sec.key} className="mt-2">
                <div className="text-[12px] font-medium tracking-wide text-stone-300">{sec.label}</div>
                {rows.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    me={me}
                    profiles={profiles}
                    allEntries={allEntries}
                    mutate={mutate}
                    pushUndo={pushUndo}
                    pastDue={isPastDue(e, sec.key)}
                  />
                ))}
              </div>
            ))}
          </section>
        )
      })}
    </div>
  )
}
