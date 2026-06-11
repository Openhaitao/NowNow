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
import { ChevronDown, ChevronLeft, ChevronRight, Pilcrow, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { fmtDate, inPeriod, periodRange } from '../lib/period'
import EntryRow from './EntryRow'
import MentionInput from './MentionInput'

const BACK_LABEL = { today: '回到今天', week: '回到本周', month: '回到本月' }
const SEC_ORDER = ['today', 'week', 'month']

// 回车新建的本地草稿行：立刻可打字，有内容才入库。默认目标，按 Tab 在 目标↔备忘 间切换
function DraftRow({ draft, profiles, onCommit, onCancel, onCancelToPrev, onNav, ghostId }) {
  const [val, setVal] = useState(draft.initial || '')
  const [isGoal, setIsGoal] = useState(draft.initial != null ? draft.is_goal : true)
  const d = { ...draft, is_goal: isGoal }
  return (
    <div className="flex items-start gap-2.5 py-[5px] text-[14.5px] leading-relaxed">
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); setIsGoal((v) => !v) }}
        title={isGoal ? '目标（Tab 或点击转备忘）' : '备忘（Tab 或点击转目标）'}
        className="mt-[3px] flex h-[17px] w-[15px] shrink-0 items-center justify-center text-stone-400 hover:text-stone-600"
      >
        {isGoal ? <Square size={13} /> : <Pilcrow size={13} />}
      </button>
      <MentionInput
        value={val}
        onChange={setVal}
        autoFocus
        initialCaret={draft.caret ?? null}
        profiles={profiles}
        onTab={() => setIsGoal((v) => !v)}
        onSubmit={() => {
          if (val.trim()) onCommit(d, val, true)
          else {
            // 空行回车 = 结束插入，回到区底输入行（光标不丢）
            onCancel(draft.key)
            document.getElementById(ghostId)?.focus()
          }
        }}
        onBlur={() => (val.trim() ? onCommit(d, val, false) : onCancel(draft.key))}
        onEmptyBackspace={() => onCancelToPrev(draft)}
        onEscape={() => onCancelToPrev(draft)}
        onArrowUp={() => onNav(d, val, -1)}
        onArrowDown={() => onNav(d, val, 1)}
      />
    </div>
  )
}

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
export default function Section({ sec, entries, me, isMyPage, profiles, allEntries, hasAnchor, allTime, baseDate, isLive = true, mutate, pushUndo, flashId, query }) {
  const [draft, setDraft] = useState('')
  const [ghostGoal, setGhostGoal] = useState(false) // 区底输入行的类型（默认备忘，Tab/点击切换）
  const [showClosed, setShowClosed] = useState(false)
  const [offset, setOffset] = useState(0)
  const [editId, setEditId] = useState(null) // 退格删条后让上一条进入编辑态
  const [drafts, setDrafts] = useState([]) // 回车新建的本地草稿行（写了字才真正入库，零等待）

  const range = periodRange(sec.key, offset, baseDate)
  const nowRange = periodRange(sec.key, 0) // 真实当前周期，用于判断"过期未完成"

  // 锚定在当前周期之前 + 还没完成的目标 = 过期未完成（标红）
  const isPastDue = (e) =>
    e.is_goal && e.status === 'open' && e.anchor && new Date(e.anchor + 'T00:00:00') < nowRange.start

  // 搜索：匹配内容文字或人（名字/handle），无视周期
  const q = (query || '').trim().toLowerCase()
  const matchesQuery = (e) => {
    if (!q) return true
    if (e.content.toLowerCase().includes(q)) return true
    const p = profiles.find((x) => x.id === e.owner)
    return p ? (p.display_name + ' ' + p.handle).toLowerCase().includes(q) : false
  }

  const { active, closed, prevUnfinished } = useMemo(() => {
    const list = entries.filter(
      (e) => e.section === sec.key && matchesQuery(e) && (q || allTime || inPeriod(e.anchor ?? null, range)),
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
  }, [entries, sec.key, offset, range, isMyPage, hasAnchor, allTime, baseDate, isLive, q])

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

  // 幽灵输入行：回车即存（乐观插入，行立即出现）。类型由行首标记定（Tab/点击切换）。新条目落区底。
  function add() {
    let content = draft.trim()
    if (!content) return
    let isGoal = ghostGoal
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

  // ↑↓ 在相邻条目间移动编辑光标；区与区之间通过幽灵行接力（整张纸连续）
  const prevSecKey = SEC_ORDER[SEC_ORDER.indexOf(sec.key) - 1]
  const nextSecKey = SEC_ORDER[SEC_ORDER.indexOf(sec.key) + 1]

  function navUp(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    if (idx > 0) setEditId(active[idx - 1].id)
    else if (prevSecKey) document.getElementById(`ghost-${prevSecKey}`)?.focus()
  }
  function navDown(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const next = active[idx + 1]
    if (next) setEditId(next.id)
    else document.getElementById(`ghost-${sec.key}`)?.focus()
  }

  // 回车 = 在当前条目下方插一行本地草稿，立刻可打字（写了字才入库——零等待）
  function editNext(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const next = idx >= 0 ? active[idx + 1] : null
    const pos = next ? (entry.position + next.position) / 2 : entry.position + 1
    setDrafts((d) => [...d, { key: `d${Date.now()}`, pos, is_goal: entry.is_goal, anchor: entry.anchor ?? null }])
  }

  // 行中回车 = 分裂：前半段留在原条，后半段进下方新行接着编辑（真文本编辑器行为）
  function splitEntry(entry, before, after) {
    mutate(
      (list) => list.map((e) => (e.id === entry.id ? { ...e, content: before } : e)),
      async () => {
        await supabase.from('entries').update({ content: before }).eq('id', entry.id)
        await syncMentions(entry.id, before, profiles, me.id)
      },
    )
    const idx = active.findIndex((e) => e.id === entry.id)
    const next = idx >= 0 ? active[idx + 1] : null
    const pos = next ? (entry.position + next.position) / 2 : entry.position + 1
    setDrafts((d) => [
      ...d,
      { key: `d${Date.now()}-s`, pos, is_goal: entry.is_goal, anchor: entry.anchor ?? null, initial: after, caret: 0 },
    ])
  }

  function cancelDraft(key) {
    setDrafts((d) => d.filter((x) => x.key !== key))
  }

  // 草稿删空退格 = 撤掉草稿并跳回上一条（和正式条目的行为一致）
  function cancelDraftToPrev(dr) {
    cancelDraft(dr.key)
    const prev = [...active].reverse().find((e) => e.position < dr.pos)
    if (prev) setEditId(prev.id)
  }

  // 草稿里按 ↑↓ = 这条默认创建完成，光标移到相邻条目
  function draftNav(dr, val, dir) {
    if (val.trim()) commitDraft(dr, val, false)
    else cancelDraft(dr.key)
    if (dir < 0) {
      const prev = [...active].reverse().find((e) => e.position < dr.pos)
      if (prev) setEditId(prev.id)
    } else {
      const next = active.find((e) => e.position > dr.pos)
      if (next) setEditId(next.id)
      else document.getElementById(`ghost-${sec.key}`)?.focus()
    }
  }

  // 草稿提交入库；andNext = 回车继续往下写
  function commitDraft(dr, content, andNext) {
    cancelDraft(dr.key)
    let isGoal = dr.is_goal
    let c = content.trim()
    if (c.startsWith('[]')) { isGoal = true; c = c.slice(2).trim() }
    if (!c) return
    const row = {
      owner: me.id,
      creator: me.id,
      section: sec.key,
      content: c,
      is_goal: isGoal,
      position: dr.pos,
    }
    if (hasAnchor) row.anchor = range.isCurrent ? fmtDate(new Date()) : dr.anchor ?? fmtDate(range.start)
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
        if (!error && data) await syncMentions(data.id, c, profiles, me.id)
      },
    )
    if (andNext) {
      const nextEntry = active.find((e) => e.position > dr.pos)
      const pos2 = nextEntry ? (dr.pos + nextEntry.position) / 2 : dr.pos + 1
      setDrafts((d) => [...d, { key: `d${Date.now()}-n`, pos: pos2, is_goal: isGoal, anchor: dr.anchor }])
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
        {hasAnchor && !allTime && !q && (
          <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/head:opacity-100">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="rounded px-1 py-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500"
              title="往回看"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              className="rounded px-1 py-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500 disabled:opacity-30"
              title="往后翻"
            >
              <ChevronRight size={13} />
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

      {prevUnfinished.length > 0 && !q && (
        <button
          onClick={carryOver}
          className="mb-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          {sec.key === 'today' ? '昨天' : sec.key === 'week' ? '上周' : '上月'}还有 {prevUnfinished.length} 条未完成 → 挪过来
        </button>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={active.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {[...active.map((e) => ({ t: 'e', v: e, pos: e.position })), ...(q ? [] : drafts).map((d) => ({ t: 'd', v: d, pos: d.pos }))]
            .sort((a, b) => a.pos - b.pos)
            .map((item) =>
              item.t === 'e' ? (
                <SortableRow key={item.v.id} entry={item.v} draggable={isMyPage && !q && (allTime || range.isCurrent)}>
                  <EntryRow
                    entry={item.v}
                    me={me}
                    profiles={profiles}
                    allEntries={allEntries}
                    mutate={mutate}
                    forceEdit={editId === item.v.id}
                    onEditHandled={() => setEditId(null)}
                    onDeleteEmpty={isMyPage ? deleteEmpty : undefined}
                    onEditNext={isMyPage ? editNext : undefined}
                    onNavUp={isMyPage ? navUp : undefined}
                    onNavDown={isMyPage ? navDown : undefined}
                    onSplit={isMyPage ? splitEntry : undefined}
                    pushUndo={pushUndo}
                    flash={flashId === item.v.id}
                    pastDue={isPastDue(item.v)}
                    ownerLabel={q ? profiles.find((p) => p.id === item.v.owner)?.display_name : null}
                    searchTerm={q || null}
                  />
                </SortableRow>
              ) : (
                <DraftRow
                  key={item.v.key}
                  draft={item.v}
                  profiles={profiles}
                  onCommit={commitDraft}
                  onCancel={cancelDraft}
                  onCancelToPrev={cancelDraftToPrev}
                  onNav={draftNav}
                  ghostId={`ghost-${sec.key}`}
                />
              ),
            )}
        </SortableContext>
      </DndContext>

      {isMyPage && !q && (
        <div className="flex items-start gap-2.5 py-[5px]">
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => { e.preventDefault(); setGhostGoal((v) => !v) }}
            title={ghostGoal ? '目标（Tab 或点击转备忘）' : '备忘（Tab 或点击转目标）'}
            className="mt-[3px] flex h-[17px] w-[15px] shrink-0 items-center justify-center text-stone-300 hover:text-stone-500"
          >
            {ghostGoal ? <Square size={13} /> : <Pilcrow size={13} />}
          </button>
          <MentionInput
            id={`ghost-${sec.key}`}
            value={draft}
            onChange={setDraft}
            onSubmit={add}
            onTab={() => setGhostGoal((v) => !v)}
            profiles={profiles}
            onEmptyBackspace={() => {
              const last = active[active.length - 1]
              if (last) setEditId(last.id)
            }}
            onArrowUp={() => {
              const last = active[active.length - 1]
              if (last) setEditId(last.id)
              else if (prevSecKey) document.getElementById(`ghost-${prevSecKey}`)?.focus()
            }}
            onArrowDown={
              nextSecKey ? () => document.getElementById(`ghost-${nextSecKey}`)?.focus() : undefined
            }
            placeholder="随便写点什么，回车即存…（Tab 或点行首切换目标/备忘，@ 派人）"
          />
        </div>
      )}

      {/* 已完成折叠：不让灰色尸体堆满整页 */}
      {closed.length > 0 && (
        <button
          onClick={() => setShowClosed((v) => !v)}
          className="mt-0.5 flex items-center gap-0.5 text-xs text-stone-300 hover:text-stone-500"
        >
          {showClosed ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 已完成 {closed.length}
        </button>
      )}
      {(showClosed || q) &&
        closed.map((e) => (
          <EntryRow key={e.id} entry={e} me={me} profiles={profiles} allEntries={allEntries} mutate={mutate} pushUndo={pushUndo} />
        ))}
      {!isMyPage && active.length === 0 && closed.length === 0 && (
        <p className="py-1 text-stone-200">—</p>
      )}
    </section>
  )
}
