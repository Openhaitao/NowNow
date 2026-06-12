import { useMemo } from 'react'
import { LayoutList } from 'lucide-react'
import EntryRow from './EntryRow'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// 全部目标：跨周期的全团队总览——今日/本周/本月 × 每个人，活派给谁一目了然
export default function TeamAllView({ allEntries, profiles, me, mutate, pushUndo }) {
  const people = useMemo(() => profiles.filter((p) => p.status !== 'pending'), [profiles])

  return (
    <div>
      <div className="mt-4 flex items-center gap-2 text-[15px] font-semibold">
        <LayoutList size={16} /> 全部目标
        <span className="text-[12px] font-normal text-stone-300">全员 · 不分周期</span>
      </div>

      {SECTIONS.map((sec) => {
        const secEntries = allEntries.filter((e) => e.section === sec.key)
        if (secEntries.length === 0) return null
        return (
          <section key={sec.key} className="pt-6">
            <h3 className="mb-1 text-[13px] font-medium tracking-wide text-stone-400">{sec.label}</h3>
            {people.map((p) => {
              const rows = secEntries.filter((e) => e.owner === p.id)
              if (rows.length === 0) return null
              const active = rows.filter((e) => e.status !== 'closed').sort((a, b) => a.position - b.position)
              const doneCount = rows.length - active.length
              return (
                <div key={p.id} className="mb-2 mt-1.5">
                  <div className="flex items-center gap-2 text-[12px] text-stone-400">
                    <span className="font-medium text-stone-500">
                      {p.display_name}
                      {p.id === me.id ? '（我）' : ''}
                    </span>
                    <span>
                      {active.length} 未完成{doneCount > 0 ? ` · ${doneCount} 已完成` : ''}
                    </span>
                  </div>
                  {active.map((e) => (
                    <EntryRow
                      key={e.id}
                      entry={e}
                      me={me}
                      profiles={profiles}
                      allEntries={allEntries}
                      mutate={mutate}
                      pushUndo={pushUndo}
                    />
                  ))}
                </div>
              )
            })}
          </section>
        )
      })}

      {allEntries.length === 0 && <p className="mt-6 text-sm text-stone-300">还没有任何内容。</p>}
    </div>
  )
}
