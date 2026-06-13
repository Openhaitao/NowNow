import { useEffect, useMemo, useState } from 'react'
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
import { ChevronLeft, ChevronRight, Pilcrow, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { fmtDate, inPeriod, periodRange } from '../lib/period'
import EntryRow from './EntryRow'
import MentionInput from './MentionInput'

const BACK_LABEL = { today: '回到今天', week: '回到本周', month: '回到本月' }
const SEC_ORDER = ['today', 'week', 'month']

// 回车新建的本地草稿行：立刻可打字，有内容才入库。默认目标，按 Tab 在 目标↔备忘 间切换
function DraftRow({ draft, profiles, onCommit, onCancel, onCancelToPrev, onNav, onSectionDone }) {
  const [val, setVal] = useState(draft.initial || '')
  const [isGoal, setIsGoal] = useState(draft.initial != null ? draft.is_goal : true)
  const d = { ...draft, is_goal: isGoal }
  return (
    <div className="flex items-start gap-2.5 py-[5px] text-[14.5px] leading-relaxed max-md:text-[16.5px]">
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => { e.preventDefault(); setIsGoal((v) => !v) }}
        title={isGoal ? '目标（Tab 或点击转备忘）' : '备忘（Tab 或点击转目标）'}
        className="mt-[5px] flex h-[15px] w-[15px] shrink-0 items-center justify-center text-stone-400 hover:text-stone-600"
      >
        {isGoal ? (
          <input type="checkbox" readOnly checked={false} tabIndex={-1} className="pointer-events-none h-[15px] w-[15px] accent-stone-700" />
        ) : (
          <Pilcrow size={13} />
        )}
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
            // 空行回车 = 这个区写完了，跳到下一个区的第一条（今日→本周→本月）
            onCancel(draft.key)
            onSectionDone()
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
          className="absolute -left-5 top-[7px] cursor-grab touch-none text-stone-300 opacity-0 group-hover/drag:opacity-100 max-md:hidden"
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
export default function Section({ sec, entries, me, isMyPage, profiles, allEntries, hasAnchor, allTime, baseDate, isLive = true, mutate, pushUndo, flashId, query, editRequest, onEditRequest, allMentions }) {
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

  // 频道周期判定。Kent gate：今日严格 = anchor==当天，空 anchor 绝不漏进今日（自然日翻篇靠这条焊死）
  const inThisPeriod = (e) => {
    if (q || allTime) return true
    if (sec.key === 'today') return e.anchor != null && inPeriod(e.anchor, range)
    return inPeriod(e.anchor ?? null, range)
  }

  const { active, closed, prevUnfinished } = useMemo(() => {
    const list = entries.filter((e) => e.section === sec.key && matchesQuery(e) && inThisPeriod(e))
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

  // 这个区写完了 → 下一个区的第一条进入编辑
  function sectionDone() {
    if (nextSecKey) onEditRequest(`${nextSecKey}:first`)
    else if (active.length) setEditId(active[active.length - 1].id)
  }

  // ★统一的"删除后光标去哪"决策：本区邻居 → 上一区最后一条 → 下一区第一条。
  // 所有删除路径都走这一个函数，光标永不悬空（跨区目标为空时由 editRequest 处理器自动给草稿）
  function focusAfterRemoval(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const neighbor = (idx > 0 ? active[idx - 1] : null) || active[idx + 1]
    if (neighbor) setEditId(neighbor.id)
    else if (prevSecKey) onEditRequest(`${prevSecKey}:last`)
    else if (nextSecKey) onEditRequest(`${nextSecKey}:first`)
  }

  // 退格删空一条 → 删掉它，光标按统一规则落位
  function deleteEmpty(entry) {
    mutate(
      (list) => list.filter((e) => e.id !== entry.id),
      () => supabase.from('entries').delete().eq('id', entry.id),
    )
    focusAfterRemoval(entry)
  }

  // 行首回车 = 在这条上方插一行草稿（在最上面继续创建）
  function insertAbove(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const prev = idx > 0 ? active[idx - 1] : null
    const pos = prev ? (prev.position + entry.position) / 2 : entry.position - 1
    setDrafts((d) => [...d, { key: `d${Date.now()}-a`, pos, is_goal: entry.is_goal, anchor: entry.anchor ?? null }])
  }

  // ↑↓ 在相邻条目间移动编辑光标；区与区之间通过幽灵行接力（整张纸连续）
  const prevSecKey = SEC_ORDER[SEC_ORDER.indexOf(sec.key) - 1]
  const nextSecKey = SEC_ORDER[SEC_ORDER.indexOf(sec.key) + 1]

  // 跨区接力："week:first" = 本周第一条进入编辑；空区直接给一行新草稿
  useEffect(() => {
    if (!editRequest || !editRequest.startsWith(sec.key + ':')) return
    onEditRequest(null)
    const pos = editRequest.split(':')[1]
    if (active.length) {
      setEditId(pos === 'last' ? active[active.length - 1].id : active[0].id)
    } else {
      setDrafts((d) => [...d, { key: `d${Date.now()}-x`, pos: 1, is_goal: true, anchor: null }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest])

  function navUp(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    if (idx > 0) setEditId(active[idx - 1].id)
    else if (prevSecKey) onEditRequest(`${prevSecKey}:last`)
  }
  function navDown(entry) {
    const idx = active.findIndex((e) => e.id === entry.id)
    const next = active[idx + 1]
    if (next) setEditId(next.id)
    else if (nextSecKey) onEditRequest(`${nextSecKey}:first`)
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
    else if (prevSecKey) onEditRequest(`${prevSecKey}:last`)
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
      else sectionDone()
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
    // 暂存箱无排期 → anchor 留空；其它频道锚到当前周期
    if (hasAnchor && sec.key !== 'stash') row.anchor = range.isCurrent ? fmtDate(new Date()) : dr.anchor ?? fmtDate(range.start)
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
        <h3 className="text-[13px] font-medium tracking-wide text-stone-400 max-md:text-[15px]">
          {sec.label}
          {range.label && <span className="ml-1.5 text-stone-300">· {range.label}</span>}
        </h3>
        {offset !== 0 && (
          <button
            onClick={() => setOffset(0)}
            className="rounded-md bg-stone-100 px-2 py-px text-[11px] text-stone-500 hover:bg-stone-200 max-md:text-[13px]"
          >
            {BACK_LABEL[sec.key]}
          </button>
        )}
        {/* ‹ › 统一钉在行最右：不随标题/标签长度漂移 */}
        {hasAnchor && !allTime && !q && (
          <span className="ml-auto flex items-center gap-0.5">
            <button
              onClick={() => setOffset((o) => o - 1)}
              className="rounded-md px-1 py-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500"
              title="往回看"
            >
              <ChevronLeft size={13} />
            </button>
            <button
              onClick={() => setOffset((o) => o + 1)}
              disabled={offset >= 0}
              className="rounded-md px-1 py-0.5 text-stone-300 hover:bg-stone-100 hover:text-stone-500 disabled:opacity-30"
              title="往后翻"
            >
              <ChevronRight size={13} />
            </button>
          </span>
        )}
      </div>

      {prevUnfinished.length > 0 && !q && (
        <button
          onClick={carryOver}
          className="mb-1 rounded-md bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 hover:bg-amber-100"
        >
          {sec.key === 'today' ? '昨天' : sec.key === 'week' ? '上周' : '上月'}还有 {prevUnfinished.length} 条未完成 → 挪过来
        </button>
      )}

      {/* 完成的条目不沉底不折叠：和未完成的混在一起，按 position 就地留存（=今天的足迹） */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={active.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {[
            ...active.map((e) => ({ t: 'e', v: e, pos: e.position })),
            ...closed.map((e) => ({ t: 'c', v: e, pos: e.position })),
            ...(q ? [] : drafts).map((d) => ({ t: 'd', v: d, pos: d.pos })),
          ]
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
                    onInsertAbove={isMyPage ? insertAbove : undefined}
                    onDeleted={isMyPage ? focusAfterRemoval : undefined}
                    pushUndo={pushUndo}
                    flash={flashId === item.v.id}
                    pastDue={isPastDue(item.v)}
                    allMentions={allMentions}
                    ownerLabel={q ? profiles.find((p) => p.id === item.v.owner)?.display_name : null}
                    searchTerm={q || null}
                  />
                </SortableRow>
              ) : item.t === 'c' ? (
                <EntryRow
                  key={item.v.id}
                  entry={item.v}
                  me={me}
                  profiles={profiles}
                  allEntries={allEntries}
                  mutate={mutate}
                  pushUndo={pushUndo}
                  allMentions={allMentions}
                  flash={flashId === item.v.id}
                  ownerLabel={q ? profiles.find((p) => p.id === item.v.owner)?.display_name : null}
                  searchTerm={q || null}
                />
              ) : (
                <DraftRow
                  key={item.v.key}
                  draft={item.v}
                  profiles={profiles}
                  onCommit={commitDraft}
                  onCancel={cancelDraft}
                  onCancelToPrev={cancelDraftToPrev}
                  onNav={draftNav}
                  onSectionDone={sectionDone}
                />
              ),
            )}
        </SortableContext>
      </DndContext>
      {/* 幽灵行：常驻在频道底部，点一下就地开写，回车连续新建（纸即输入，取代独立输入框） */}
      {isMyPage && !q && (
        <div
          onClick={() =>
            setDrafts((d) => [
              ...d,
              {
                key: `d${Date.now()}-g`,
                pos: (active.length ? Math.max(...active.map((e) => e.position)) : 0) + 1,
                is_goal: true,
                anchor: null,
              },
            ])
          }
          className="flex cursor-text items-start gap-2.5 py-[5px] text-[14.5px] leading-relaxed text-stone-300 max-md:py-2 max-md:text-[16.5px]"
        >
          <span className="mt-[5px] w-[15px] shrink-0 text-center leading-none">＋</span>
          <span>现在要做什么？回车存，@ 派人</span>
        </div>
      )}
      {!isMyPage && active.length === 0 && closed.length === 0 && (
        <p className="py-1 text-stone-200">—</p>
      )}
    </section>
  )
}
