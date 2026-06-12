import { useEffect, useRef, useState } from 'react'
import { CalendarArrowUp, Eye, Lock, MoveRight, Pencil, Pilcrow, Square, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { renderEntryContent } from '../lib/render'
import { resolveDateToken } from '../lib/dates'
import DatePicker from './DatePicker'
import MentionInput from './MentionInput'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

// 点击渲染文本时，算出点击处对应的字符偏移（md 标记符会有少量偏差，忍）
function caretOffsetIn(container) {
  const sel = window.getSelection()
  if (!sel || !sel.anchorNode || !container.contains(sel.anchorNode)) return null
  const range = sel.getRangeAt(0).cloneRange()
  range.selectNodeContents(container)
  range.setEnd(sel.anchorNode, sel.anchorOffset)
  return range.toString().length
}

export default function EntryRow({ entry, me, profiles, allEntries, mutate, forceEdit, onEditHandled, onDeleteEmpty, onEditNext, onNavUp, onNavDown, onSplit, onInsertAbove, onDeleted, pushUndo, flash, pastDue, ownerLabel, searchTerm, allMentions = [] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.content)
  const [menu, setMenu] = useState(null) // {x,y} | {sheet:true} | null
  // 手机上 ⋯ 菜单改成底部抽屉：浮在指尖的小菜单在触屏上很难点
  const openMenu = (x, y) =>
    setMenu(window.matchMedia('(max-width: 767px)').matches ? { sheet: true } : { x, y })
  const [closing, setClosing] = useState(false) // 完成动画：先划线变灰，再沉底
  const [clickCaret, setClickCaret] = useState(null)
  const [datePop, setDatePop] = useState(null) // {token, x, y} 日期 chip 的修改/删除弹层
  const rowRef = useRef(null)

  // 搜索定位：高亮闪烁 + 滚进视野
  useEffect(() => {
    if (flash) rowRef.current?.scrollIntoView({ block: 'center' })
  }, [flash])

  // Section 让我进入编辑态（退格删条后跳回上一条）
  useEffect(() => {
    if (forceEdit) {
      setText(entry.content)
      setEditing(true)
      onEditHandled?.()
    }
  }, [forceEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  const isMine = entry.owner === me.id
  const isCreator = entry.creator === me.id
  const closed = entry.status === 'closed'
  const resolved = entry.status === 'resolved'

  // 认领副本 → 找到原条目（用于：副本勾选回流原件 / 在对方页面给 creator 关闭入口）
  const original = entry.source_entry ? allEntries.find((e) => e.id === entry.source_entry) : null
  const canCloseOriginal = original && original.creator === me.id && original.status === 'resolved'
  const originalCreator = original ? profiles.find((p) => p.id === original.creator) : null
  const [notified, setNotified] = useState(false) // 勾选认领副本后的"已通知"轻提示

  // 全部走乐观更新：本地立即生效，服务端后台同步
  const patchLocal = (fields) => (list) =>
    list.map((e) => (e.id === entry.id ? { ...e, ...fields } : e))

  // 默认就存：打字停顿 600ms 自动落库（无"保存"动作）；回车只负责跳下一条
  const saveTimer = useRef(null)
  useEffect(() => () => clearTimeout(saveTimer.current), [])

  function persist(v) {
    const t = v.trim()
    if (!t || t === entry.content) return
    mutate(patchLocal({ content: t }), async () => {
      await supabase.from('entries').update({ content: t }).eq('id', entry.id)
      await syncMentions(entry.id, t, profiles, me.id)
    })
  }

  function handleEditChange(v) {
    setText(v)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persist(v), 600)
  }

  function saveEdit(advance = false, caret = null) {
    clearTimeout(saveTimer.current)
    // 行首回车 = 在上方插入新行（在最上面继续创建的习惯）
    if (advance && onInsertAbove && caret === 0 && text.trim()) {
      persist(text)
      setEditing(false)
      onInsertAbove(entry)
      return
    }
    // 行中回车 = 分裂：前半段留下，后半段带进下一行（光标在行首时不分裂——会把原条掏空）
    if (advance && onSplit && caret != null && caret > 0 && caret < text.length && text.slice(caret).trim() && text.slice(0, caret).trim()) {
      setEditing(false)
      onSplit(entry, text.slice(0, caret).trimEnd(), text.slice(caret).trimStart())
      return
    }
    persist(text)
    setEditing(false)
    if (!text.trim()) {
      // 删空了就是要删掉这条（之前会把旧文字弹回来，反直觉）。⌘Z 可恢复。
      if (entry.content) pushUndo?.({ type: 'delete', row: entry })
      mutate(
        (list) => list.filter((e) => e.id !== entry.id),
        () => supabase.from('entries').delete().eq('id', entry.id),
      )
      return
    }
    if (advance) onEditNext?.(entry)
  }

  async function toggleDone() {
    const next = closed ? 'open' : 'closed'
    if (next === 'closed') {
      pushUndo?.({ type: 'status', id: entry.id, prev: entry.status })
      setClosing(true)
      if (entry.source_entry && originalCreator) {
        setNotified(true)
        setTimeout(() => setNotified(false), 2500)
      }
      await new Promise((r) => setTimeout(r, 350)) // 让打勾→划线的爽感停留一拍再沉底
      setClosing(false)
    }
    mutate(patchLocal({ status: next }), async () => {
      if (entry.source_entry && next === 'closed') {
        await supabase.rpc('resolve_entry', { p_entry_id: entry.source_entry })
      }
      await supabase.from('entries').update({ status: next }).eq('id', entry.id)
    })
  }

  function closeOriginal() {
    pushUndo?.({ type: 'status', id: original.id, prev: original.status })
    mutate(
      (list) => list.map((e) => (e.id === original.id ? { ...e, status: 'closed' } : e)),
      () => supabase.from('entries').update({ status: 'closed' }).eq('id', original.id),
    )
  }

  function closeSelf() {
    pushUndo?.({ type: 'status', id: entry.id, prev: entry.status })
    mutate(patchLocal({ status: 'closed' }), () =>
      supabase.from('entries').update({ status: 'closed' }).eq('id', entry.id),
    )
  }

  function togglePrivate() {
    setMenu(null)
    mutate(patchLocal({ is_private: !entry.is_private }), () =>
      supabase.from('entries').update({ is_private: !entry.is_private }).eq('id', entry.id),
    )
  }

  function toggleGoal() {
    setMenu(null)
    mutate(patchLocal({ is_goal: !entry.is_goal, status: 'open' }), () =>
      supabase.from('entries').update({ is_goal: !entry.is_goal, status: 'open' }).eq('id', entry.id),
    )
  }

  function remove() {
    setMenu(null)
    pushUndo?.({ type: 'delete', row: entry })
    mutate(
      (list) => list.filter((e) => e.id !== entry.id),
      () => supabase.from('entries').delete().eq('id', entry.id),
    )
    onDeleted?.(entry)
  }

  function moveTo(section) {
    setMenu(null)
    mutate(patchLocal({ section }), () =>
      supabase.from('entries').update({ section }).eq('id', entry.id),
    )
  }

  // 回看历史时：把过去的条目挪回当前周期
  const todayStr = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()
  const canMoveToToday = entry.anchor && entry.anchor !== todayStr && entry.status !== 'closed'

  function moveToToday() {
    setMenu(null)
    mutate(patchLocal({ anchor: todayStr }), () =>
      supabase.from('entries').update({ anchor: todayStr }).eq('id', entry.id),
    )
  }

  // 日期 chip 点击 → 改日期/删除
  function persistContent(c) {
    mutate(patchLocal({ content: c }), () =>
      supabase.from('entries').update({ content: c }).eq('id', entry.id),
    )
  }

  // @token 上的认领状态标：○未认领 ●已认领 ✓已解决
  const mentionStates = {}
  for (const m of allMentions.filter((x) => x.entry_id === entry.id)) {
    const p = profiles.find((x) => x.id === m.mentioned)
    if (p)
      mentionStates[p.handle.toLowerCase()] = m.rejected_at
        ? 'rejected'
        : entry.status === 'resolved'
          ? 'resolved'
          : m.claimed_entry
            ? 'claimed'
            : 'unclaimed'
  }

  const rendered = renderEntryContent(entry.content, profiles, {
    meHandle: me.handle,
    highlightMe: !isMine,
    searchTerm: searchTerm || null,
    mentionStates,
    onDateClick: isMine
      ? (token, e) => {
          e.stopPropagation()
          const r = e.target.getBoundingClientRect()
          setDatePop({ token, x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 4 })
        }
      : undefined,
  })

  return (
    <div
      ref={rowRef}
      className={
        'entry-row group flex items-start gap-2.5 rounded-md py-[5px] pr-1.5 text-[14.5px] leading-relaxed transition-colors max-md:py-2 max-md:text-[16.5px] ' +
        (closing ? 'closing ' : '') +
        (editing ? '' : 'hover:bg-stone-50 ') +
        (flash ? 'bg-amber-100 ' : '') +
        (closed || closing
          ? 'text-stone-300'
          : resolved
            ? 'bg-blue-50/60 px-1.5 -ml-1.5'
            : pastDue
              ? 'bg-red-50/70 px-1.5 -ml-1.5'
              : entry.is_goal
                ? ''
                : 'text-stone-500') // 备忘比目标灰一档，扫一眼即可区分
      }
      onContextMenu={(e) => {
        if (!isMine) return
        e.preventDefault()
        openMenu(e.clientX, e.clientY)
      }}
    >
      {entry.is_goal ? (
        <input
          type="checkbox"
          checked={closed || closing}
          disabled={!isMine || closing}
          onChange={toggleDone}
          className="mt-[5px] h-[15px] w-[15px] shrink-0 accent-stone-700 max-md:mt-[4px] max-md:h-[20px] max-md:w-[20px]"
          title={entry.source_entry ? '完成（会通知发起人）' : '完成'}
        />
      ) : (
        // 备忘和目标同级：常显 ¶ 标记（浅灰，分量低于勾选框）
        <Pilcrow size={13} className="mt-[5px] w-[15px] shrink-0 text-stone-300" />
      )}

      {editing && isMine ? (
        <>
          {entry.is_private && (
            <Lock size={13} className="mt-[6px] shrink-0 text-stone-400" title="仅自己可见" />
          )}
          <MentionInput
          value={text}
          onChange={handleEditChange}
          onSubmit={(caret) => saveEdit(true, caret)}
          onBlur={() => saveEdit(false)}
          onEscape={() => { setText(entry.content); setEditing(false) }}
          onEmptyBackspace={onDeleteEmpty ? () => { clearTimeout(saveTimer.current); setEditing(false); onDeleteEmpty(entry) } : undefined}
          onTab={() => mutate(patchLocal({ is_goal: !entry.is_goal }), () =>
            supabase.from('entries').update({ is_goal: !entry.is_goal }).eq('id', entry.id),
          )}
          onArrowUp={onNavUp ? () => { saveEdit(false); onNavUp(entry) } : undefined}
          onArrowDown={onNavDown ? () => { saveEdit(false); onNavDown(entry) } : undefined}
          profiles={profiles}
          mentionStates={mentionStates}
          autoFocus
          initialCaret={clickCaret}
        />
        </>
      ) : (
        <span
          className={'min-w-0 flex-1 whitespace-pre-wrap ' + (closed || closing ? 'line-through' : '')}
          onClick={(e) => {
            if (!isMine || closed) return
            setClickCaret(caretOffsetIn(e.currentTarget))
            setText(entry.content)
            setEditing(true)
          }}
        >
          {ownerLabel && <span className="mr-1.5 text-xs text-stone-300">{ownerLabel}</span>}
          {entry.is_private && (
            <Lock size={13} className="mr-1 inline -translate-y-px text-stone-400" title="仅自己可见" />
          )}
          {rendered}
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1.5">
        {notified && (
          <span className="rounded-full bg-emerald-100 px-2 py-px text-xs text-emerald-700 max-md:text-[13px]">
            已通知 {originalCreator?.display_name}
          </span>
        )}
        {!notified && originalCreator && !closed && (
          <span
            className="rounded bg-stone-100 px-1.5 py-px text-[11px] text-stone-500 max-md:text-[13px]"
            title="认领来的活，完成后会自动通知对方验收"
          >
            来自{originalCreator.display_name}
          </span>
        )}
        {isMine && (
          <button
            title="操作"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              openMenu(Math.min(r.left, window.innerWidth - 170), r.bottom + 4)
            }}
            className="flex h-[20px] items-center self-center rounded px-1 text-stone-400 opacity-0 outline-none hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100 max-md:h-[32px] max-md:px-2 max-md:opacity-60"
          >
            ⋯
          </button>
        )}
        {resolved && (
          <span className="rounded-full bg-blue-100 px-2 py-px text-xs text-blue-700">
            已解决
          </span>
        )}
        {resolved && isCreator && (
          <button
            onClick={closeSelf}
            className="rounded-md border border-blue-600 px-2 py-px text-xs text-blue-700 hover:bg-blue-600 hover:text-white"
          >
            关闭
          </button>
        )}
        {canCloseOriginal && (
          <button
            onClick={closeOriginal}
            title="你派的事已解决，确认关闭"
            className="rounded-md border border-blue-600 px-2 py-px text-xs text-blue-700 opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white max-md:opacity-100 max-md:py-1"
          >
            关闭我派的原件
          </button>
        )}
      </span>

      {datePop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setDatePop(null)} />
          <div className="fixed z-50" style={{ left: datePop.x, top: datePop.y }}>
            <div className="relative">
              <DatePicker
                value={resolveDateToken(datePop.token)}
                onClose={() => setDatePop(null)}
                onSelect={(d) => {
                  const t = d || new Date()
                  const newTok = `${t.getMonth() + 1}月${t.getDate()}日`
                  persistContent(entry.content.replace(datePop.token, newTok))
                }}
                onDelete={() =>
                  persistContent(entry.content.replace(datePop.token, '').replace(/\s{2,}/g, ' ').trim())
                }
              />
            </div>
          </div>
        </>
      )}

      {menu && (
        <>
          <div
            className={'fixed inset-0 z-40' + (menu.sheet ? ' bg-black/25' : '')}
            onClick={() => setMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setMenu(null) }}
          />
          <div
            className={
              menu.sheet
                ? 'fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-stone-200 bg-white p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[15px] shadow-2xl'
                : 'fixed z-50 w-40 rounded-xl border border-stone-200 bg-white p-1 text-sm shadow-xl'
            }
            style={menu.sheet ? undefined : { left: menu.x, top: menu.y }}
          >
            <button
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none hover:bg-stone-100 max-md:px-4 max-md:py-3"
              onClick={() => { setMenu(null); setText(entry.content); setEditing(true) }}
            >
              <Pencil size={13} /> 编辑
            </button>
            <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none hover:bg-stone-100 max-md:px-4 max-md:py-3" onClick={togglePrivate}>
              {entry.is_private ? <Eye size={13} /> : <Lock size={13} />}
              {entry.is_private ? '设为公开' : '仅自己可见'}
            </button>
            <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none hover:bg-stone-100 max-md:px-4 max-md:py-3" onClick={toggleGoal}>
              {entry.is_goal ? <Pilcrow size={13} /> : <Square size={13} />}
              {entry.is_goal ? '转为备忘' : '转为目标'}
            </button>
            {canMoveToToday && (
              <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-amber-700 outline-none hover:bg-amber-50 max-md:px-4 max-md:py-3" onClick={moveToToday}>
                <CalendarArrowUp size={13} /> 挪到今天
              </button>
            )}
            {Object.keys(SECTION_LABELS)
              .filter((s) => s !== entry.section)
              .map((s) => (
                <button key={s} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left outline-none hover:bg-stone-100 max-md:px-4 max-md:py-3" onClick={() => moveTo(s)}>
                  <MoveRight size={13} /> 移到{SECTION_LABELS[s]}
                </button>
              ))}
            {isCreator && (
              <button className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-red-600 outline-none hover:bg-red-50 max-md:px-4 max-md:py-3" onClick={remove}>
                <Trash2 size={13} /> 删除
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
