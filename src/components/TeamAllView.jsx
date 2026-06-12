import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, LayoutList } from 'lucide-react'
import { inPeriod, periodRange } from '../lib/period'
import EntryRow from './EntryRow'

// 全部目标 = 站会页：每个人「今日进行中 + 过期欠账（红）」常显，
// 本周/本月/已完成折叠成一行小计；每条活带"谁派的、认领没、办得怎么样"
export default function TeamAllView({ allEntries, allMentions = [], profiles, orderedPeople, me, mutate, pushUndo, foldAt = Infinity, baseDate = null }) {
  const [expanded, setExpanded] = useState({}) // personId -> bool（本周/本月/已完成小计）
  const [foldOpen, setFoldOpen] = useState({}) // personId -> bool（折叠区成员展开整块）
  const [dayOff, setDayOff] = useState({}) // personId -> 天数偏移（负=往回看这个人前几天的目标）

  // 人的顺序跟侧栏拖拽顺序一致（orderedPeople 由 Board 传入）；兜底用"我在前"
  const people = useMemo(() => {
    if (orderedPeople?.length) return orderedPeople
    const active = profiles.filter((p) => p.status !== 'pending')
    return [...active.filter((p) => p.id === me.id), ...active.filter((p) => p.id !== me.id)]
  }, [orderedPeople, profiles, me.id])

  // 顶部日期锚 + 每个人自己的 ‹ › 日偏移：这个人的"当天/当周/当月"按偏移后的日子算
  const DAY = 86400000
  const baseFor = (off) => {
    const b = baseDate ? new Date(baseDate) : new Date()
    b.setHours(0, 0, 0, 0)
    return new Date(b.getTime() + off * DAY)
  }
  const rangesFor = (off) => {
    const base = off === 0 ? baseDate || undefined : baseFor(off)
    return {
      today: periodRange('today', 0, base),
      week: periodRange('week', 0, base),
      month: periodRange('month', 0, base),
    }
  }

  const isPastDue = (e, ranges) =>
    e.is_goal && e.status === 'open' && e.anchor &&
    new Date(e.anchor + 'T00:00:00') < ranges[e.section].start

  const rowsOf = (pid, ranges) => {
    const mine = allEntries.filter((en) => en.owner === pid)
    const inCur = (en) => inPeriod(en.anchor ?? null, ranges[en.section])
    return {
      // 常显：今日进行中 + 全部过期欠账
      now: mine
        .filter((en) => en.status !== 'closed' && ((en.section === 'today' && inCur(en)) || isPastDue(en, ranges)))
        .sort((a, b) => a.position - b.position),
      week: mine.filter((en) => en.status !== 'closed' && en.section === 'week' && inCur(en)),
      month: mine.filter((en) => en.status !== 'closed' && en.section === 'month' && inCur(en)),
      done: mine.filter((en) => en.status === 'closed'),
    }
  }

  const renderRow = (r) => (e) => (
    <EntryRow
      key={e.id}
      entry={e}
      me={me}
      profiles={profiles}
      allEntries={allEntries}
      allMentions={allMentions}
      mutate={mutate}
      pushUndo={pushUndo}
      pastDue={isPastDue(e, r)}
    />
  )

  // 折叠线和侧栏同一条：线上的人完整展示，线下的人一行摘要、点开才展开
  const pinned = people.slice(0, foldAt)
  const rest = people.slice(foldAt)

  const personSection = (p) => {
        const off = dayOff[p.id] || 0
        const pr = rangesFor(off)
        const r = rowsOf(p.id, pr)
        const row = renderRow(pr)
        const open = expanded[p.id] !== false // 默认展开（用户拍板）
        const moreCount = r.week.length + r.month.length
        const d = baseFor(off)
        const dayLabel = off === 0 ? '今日' : `${d.getMonth() + 1}月${d.getDate()}日`
        return (
          <section key={p.id} className="border-b border-stone-100 py-5 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold max-md:text-[17px]">{p.display_name}</span>
              <span className="text-xs text-stone-300 max-md:text-[13px]">
                {r.now.length ? `${dayLabel} ${r.now.length} 条进行中` : `${dayLabel}暂无进行中`}
              </span>
              {r.now.some((e) => isPastDue(e, pr)) && (
                <span className="text-xs text-red-400 max-md:text-[13px]">含过期欠账</span>
              )}
              {/* 每个人的日拨盘统一钉在行最右：不随名字长短漂移。‹ 看他昨天的目标，› 拨回来 */}
              <span className="ml-auto flex items-center gap-1.5">
                {off !== 0 && (
                  <button
                    onClick={() => setDayOff((x) => ({ ...x, [p.id]: 0 }))}
                    className="rounded-full bg-stone-100 px-2 py-px text-[11px] text-stone-500 hover:bg-stone-200"
                  >
                    回到今天
                  </button>
                )}
                <span className="flex items-center text-stone-300">
                  <button
                    onClick={() => setDayOff((x) => ({ ...x, [p.id]: off - 1 }))}
                    title="看前一天"
                    className="rounded p-0.5 hover:bg-stone-100 hover:text-stone-500"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    onClick={() => setDayOff((x) => ({ ...x, [p.id]: off + 1 }))}
                    title="看后一天"
                    className="rounded p-0.5 hover:bg-stone-100 hover:text-stone-500"
                  >
                    <ChevronRight size={13} />
                  </button>
                </span>
              </span>
            </div>

            {r.now.map(row)}

            {(moreCount > 0 || r.done.length > 0) && (
              <button
                onClick={() => setExpanded((x) => ({ ...x, [p.id]: !open }))}
                className="mt-1.5 flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500 outline-none hover:bg-stone-200 max-md:py-1 max-md:text-[14px]"
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                本周 {r.week.length} · 本月 {r.month.length} · 已完成 {r.done.length}
              </button>
            )}

            {open && (
              <div className="mt-1">
                {r.week.length > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[12px] font-medium text-stone-300 max-md:text-[13.5px]">本周</div>
                    {r.week.map(row)}
                  </div>
                )}
                {r.month.length > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[12px] font-medium text-stone-300 max-md:text-[13.5px]">本月</div>
                    {r.month.map(row)}
                  </div>
                )}
                {r.done.length > 0 && (
                  <div className="mt-1.5">
                    <div className="text-[12px] font-medium text-stone-300 max-md:text-[13.5px]">已完成</div>
                    {r.done.slice(0, 10).map(row)}
                    {r.done.length > 10 && (
                      <div className="pl-[25px] text-[11px] text-stone-300">…还有 {r.done.length - 10} 条，去他的主页看</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )
  }

  return (
    <div>
      <div className="mt-4 flex items-center gap-2 text-[15px] font-semibold">
        <LayoutList size={16} /> 全部目标
        <span className="text-[12px] font-normal text-stone-300">每个人今天在干什么 · 谁的活谁派的</span>
      </div>

      {pinned.map(personSection)}

      {rest.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-300">其他成员</div>
          {rest.map((p) => {
            const open = !!foldOpen[p.id]
            const r = rowsOf(p.id, rangesFor(0))
            const overdue = r.now.filter((e) => isPastDue(e, rangesFor(0))).length
            return (
              <div key={p.id}>
                <button
                  onClick={() => setFoldOpen((x) => ({ ...x, [p.id]: !open }))}
                  className="flex w-full items-center gap-2 border-b border-stone-100 py-2.5 text-left last:border-0 hover:bg-stone-50"
                >
                  {open ? <ChevronDown size={12} className="shrink-0 text-stone-300" /> : <ChevronRight size={12} className="shrink-0 text-stone-300" />}
                  <span className="text-[14px] font-medium max-md:text-[16px]">{p.display_name}</span>
                  <span className="text-xs text-stone-300 max-md:text-[13px]">
                    今日 {r.now.length - overdue} · 本周 {r.week.length} · 本月 {r.month.length}
                  </span>
                  {overdue > 0 && <span className="text-xs text-red-400">过期 {overdue}</span>}
                </button>
                {open && <div className="pl-5">{personSection(p)}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
