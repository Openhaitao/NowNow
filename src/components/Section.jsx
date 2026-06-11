import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { fmtDate, inPeriod, periodRange } from '../lib/period'
import EntryRow from './EntryRow'
import MentionInput from './MentionInput'

const BACK_LABEL = { today: '回到今天', week: '回到本周', month: '回到本月' }

function SortableRow({ entry, draggable, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !draggable,
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={'group/drag relative ' + (isDragging ? 'z-10 opacity-70' : '')}
    >
      {draggable && (
        <span
          {...attributes}
          {...listeners}
          className="absolute -left-5 top-[7px] cursor-grab touch-none text-stone-300 opacity-0 group-hover/drag:opacity-100"
          title="拖动排序"
        >
          ⠿
        </span>
      )}
      {children}
    </div>
  )
}

// allTime = 「全部目标」视图：无视日历周期，这一区的所有条目都显示
// baseDate / isLive = 全局日期锚：整张纸拨回某天（isLive=false 时为回看模式）
export default function Section({ sec, entries, me, isMyPage, profiles, allEntries, hasAnchor, allTime, baseDate, isLive = true, mutate }) {
  const [draft, setDraft] = useState('')
  const [showClosed, setShowClosed] = useState(false)
  const [offset, setOffset] = useState(0)
  const [editId, setEditId] = useState(null) // 退格删条后让上一条进入编辑态

  const range = periodRange(sec.key, offset, baseDate)

  const { active, closed, prevUnfinished } = useMemo(() => {
    const list = entries.filter(
      (e) => e.section === sec.key && (allTime || inPeriod(e.anchor ?? null, range)),
    )
    const prevRange = periodRange(sec.key, offset - 1, baseDate)
    return {
      active: list.filter((e) => e.status !== 'closed').sort((a, b) => a.position - b.position),
      closed: list
        .filter((e) => e.status === 'closed')
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
      prevUnfinished:
        isMyPage && hasAnchor && offset === 0 && !allTime && isLive
          ? entries.filter(
              (e) =>
                e.section === sec.key &&
                inPeriod(e.anchor ?? null, prevRange) &&
                e.is_goal &&
                e.status !== 'closed',
            )
          : [],
    }
  }, [entries, sec.key, offset, range, isMyPage, hasAnchor, allTime, baseDate, isLive])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  function onDragEnd({ active: a, over }) {
    if (!over || a.id === over.id) return
    const from = active.findIndex((e) => e.id === a.id)
    const to = active.findIndex((e) => e.id === over.id)
    if (from === -1 || to === -1) return
    // 移除自己后，落点的前后邻居决定新 position（取均值，浮点数永远插得进）
    const rest = active.filter((e) => e.id !== a.id)
    const prev = rest[to - 1] || null
    const next = rest[to] || null
    let pos
    if (prev && next) pos = (prev.position + next.position) / 2
    else if (prev) pos = prev.position + 1
    else if (next) pos = next.position - 1
    else pos = 0
    mutate(
      (list) => list.map((e) => (e.id === a.id ? { ...e, position: pos } : e)),
      () => supabase.from('entries').update({ position: pos }).eq('id', a.id),
    )
  }

  // 幽灵输入行：回车即存（乐观插入，行立即出现）。默认备忘；行首 [] = 目标。新条目落区底。
  function add() {
    let content = draft.trim()
    if (!content) return
    let isGoal = false
    if (content.startsWith('[]')) {
      isGoal = true
      content = content.slice(2).trim()
      if (!content) return
    }
    setDraft('')
    const maxPos = Math.max(0, ...active.map((x) => x.position), ...closed.map((x) => x.position))
    const row = {
      owner: me.id,
      creator: me.id,
      section: sec.key,
      content,
      is_goal: isGoal,
      position: maxPos + 1,
    }
    if (hasAnchor) row.anchor = range.isCurrent ? fmtDate(new Date()) : fmtDate(range.start)
    const temp = {
      ...row,
      id: `tmp-${Date.now()}`,
      status: 'open',
      is_private: false,
      source_entry: null,
      anchor: row.anchor ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mutate(
      (list) => [...list, temp],
      async () => {
        const { data, error } = await supabase.from('entries').insert(row).select().single()
        if (!error && data) await syncMentions(data.id, content, profiles, me.id)
      },
    )
  }

  // 退格删空一条 → 删掉它，光标跳回上一条末尾（block 编辑器行为）
  function deleteEmpty(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const prev = idx > 0 ? active[idx - 1] : null
    mutate(
      (list) => list.filter((e) => e.id !== entry.id),
      () => supabase.from('entries').delete().eq('id', entry.id),
    )
    if (prev) setEditId(prev.id)
  }

  // 回车 = 在当前条目下方新建一条空目标/备忘并直接编辑（Apple Notes 行为）
  async function editNext(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const next = idx >= 0 ? active[idx + 1] : null
    const pos = next ? (entry.position + next.position) / 2 : entry.position + 1
    const row = {
      owner: me.id,
      creator: me.id,
      section: sec.key,
      content: '',
      is_goal: entry.is_goal,
      position: pos,
    }
    if (hasAnchor) row.anchor = entry.anchor ?? fmtDate(new Date())
    const { data } = await supabase.from('entries').insert(row).select().single()
    if (data) {
      mutate((list) => (list.some((e) => e.id === data.id) ? list : [...list, data]), () => {})
      setEditId(data.id)
    }
  }

  // 上一周期的未完成目标一键挪过来（手动，系统不自动滚动）
  function carryOver() {
    const today = fmtDate(new Date())
    const ids = prevUnfinished.map((e) => e.id)
    mutate(
      (list) => list.map((e) => (ids.includes(e.id) ? { ...e, anchor: today } : e)),
      async () => {
        for (const id of ids) {
          await supabase.from('entries').update({ anchor: today }).eq('id', id)
        }
      },
    )
  }

  return (
    <section className="pt-6">
      <div className="group/head mb-1 flex items-center gap-1.5">
        <h3 className="text-[13px] font-medium tracking-wide text-stone-400">
          {sec.label}
          {range.label && <span className="ml-1.5 text-stone-300">· {range.label}</span>}
        </h3>
        {hasAnchor && !allTime && (
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/head:opacity-100">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="rounded px-1 text-xs text-stone-300 hover:bg-stone-100 hover:text-stone-500"
              title="往回看"
            >
              ◀
            </button>
            <button
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              className="rounded px-1 text-xs text-stone-300 hover:bg-stone-100 hover:text-stone-500 disabled:opacity-30"
              title="往后翻"
            >
              ▶
            </button>
          </span>
        )}
        {offset !== 0 && (
          <button
            onClick={() => setOffset(0)}
            className="rounded-full bg-stone-100 px-2 py-px text-[11px] text-stone-500 hover:bg-stone-200"
          >
            {BACK_LABEL[sec.key]}
          </button>
        )}
      </div>

      {prevUnfinished.length > 0 && (
        <button
          onClick={carryOver}
          className="mb-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          {sec.key === 'today' ? '昨天' : sec.key === 'week' ? '上周' : '上月'}还有 {prevUnfinished.length} 条未完成 → 挪过来
        </button>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={active.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {active.map((e) => (
            <SortableRow key={e.id} entry={e} draggable={isMyPage && (allTime || range.isCurrent)}>
              <EntryRow
                entry={e}
                me={me}
                profiles={profiles}
                allEntries={allEntries}
                mutate={mutate}
                forceEdit={editId === e.id}
                onEditHandled={() => setEditId(null)}
                onDeleteEmpty={isMyPage ? deleteEmpty : undefined}
                onEditNext={isMyPage ? editNext : undefined}
              />
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>

      {isMyPage && (
        <div className="flex items-start gap-2.5 py-[5px]">
          <span className="w-[15px] shrink-0" />
          <MentionInput
            id={`ghost-${sec.key}`}
            value={draft}
            onChange={setDraft}
            onSubmit={add}
            profiles={profiles}
            placeholder="随便写点什么，回车即存…（行首 [] = 目标，@ 可以派人）"
          />
        </div>
      )}

      {/* 已完成折叠：不让灰色尸体堆满整页 */}
      {closed.length > 0 && (
        <button
          onClick={() => setShowClosed((v) => !v)}
          className="mt-0.5 text-xs text-stone-300 hover:text-stone-500"
        >
          {showClosed ? '▾' : '▸'} 已完成 {closed.length}
        </button>
      )}
      {showClosed &&
        closed.map((e) => (
          <EntryRow key={e.id} entry={e} me={me} profiles={profiles} allEntries={allEntries} mutate={mutate} />
        ))}
      {!isMyPage && active.length === 0 && closed.length === 0 && (
        <p className="py-1 text-stone-200">—</p>
      )}
    </section>
  )
}
