import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { renderEntryContent } from '../lib/render'
import MentionInput from './MentionInput'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

export default function EntryRow({ entry, me, profiles, allEntries, mutate }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.content)
  const [menu, setMenu] = useState(null) // {x,y} | null
  const [closing, setClosing] = useState(false) // 完成动画：先划线变灰，再沉底

  const isMine = entry.owner === me.id
  const isCreator = entry.creator === me.id
  const closed = entry.status === 'closed'
  const resolved = entry.status === 'resolved'

  // 认领副本 → 找到原条目（用于：副本勾选回流原件 / 在对方页面给 creator 关闭入口）
  const original = entry.source_entry ? allEntries.find((e) => e.id === entry.source_entry) : null
  const canCloseOriginal = original && original.creator === me.id && original.status === 'resolved'

  // 全部走乐观更新：本地立即生效，服务端后台同步
  const patchLocal = (fields) => (list) =>
    list.map((e) => (e.id === entry.id ? { ...e, ...fields } : e))

  function saveEdit() {
    setEditing(false)
    const t = text.trim()
    if (!t || t === entry.content) { setText(entry.content); return }
    mutate(patchLocal({ content: t }), async () => {
      await supabase.from('entries').update({ content: t }).eq('id', entry.id)
      await syncMentions(entry.id, t, profiles, me.id)
    })
  }

  async function toggleDone() {
    const next = closed ? 'open' : 'closed'
    if (next === 'closed') {
      setClosing(true)
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
    mutate(
      (list) => list.map((e) => (e.id === original.id ? { ...e, status: 'closed' } : e)),
      () => supabase.from('entries').update({ status: 'closed' }).eq('id', original.id),
    )
  }

  function closeSelf() {
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
    if (!window.confirm('删除这条？')) return
    mutate(
      (list) => list.filter((e) => e.id !== entry.id),
      () => supabase.from('entries').delete().eq('id', entry.id),
    )
  }

  function moveTo(section) {
    setMenu(null)
    mutate(patchLocal({ section }), () =>
      supabase.from('entries').update({ section }).eq('id', entry.id),
    )
  }

  const rendered = renderEntryContent(entry.content, profiles, {
    meHandle: me.handle,
    highlightMe: !isMine,
  })

  return (
    <div
      className={
        'entry-row group flex items-start gap-2.5 py-[5px] text-[14.5px] leading-relaxed ' +
        (closing ? 'closing ' : '') +
        (closed || closing ? 'text-stone-300' : resolved ? 'rounded-md bg-blue-50/60 px-1.5 -ml-1.5' : '')
      }
      onContextMenu={(e) => {
        if (!isMine) return
        e.preventDefault()
        setMenu({ x: e.clientX, y: e.clientY })
      }}
    >
      {entry.is_goal ? (
        <input
          type="checkbox"
          checked={closed || closing}
          disabled={!isMine || closing}
          onChange={toggleDone}
          className="mt-[5px] h-[15px] w-[15px] shrink-0 accent-stone-700"
          title={entry.source_entry ? '完成（会通知发起人）' : '完成'}
        />
      ) : (
        <span className="w-[15px] shrink-0" />
      )}

      {editing && isMine ? (
        <MentionInput
          value={text}
          onChange={setText}
          onSubmit={saveEdit}
          onBlur={saveEdit}
          onEscape={() => { setText(entry.content); setEditing(false) }}
          profiles={profiles}
          autoFocus
        />
      ) : (
        <span
          className={'min-w-0 flex-1 whitespace-pre-wrap ' + (closed || closing ? 'line-through' : '')}
          onClick={() => isMine && !closed && (setText(entry.content), setEditing(true))}
        >
          {entry.is_private && <span title="仅自己可见">🔒 </span>}
          {rendered}
        </span>
      )}

      <span className="flex shrink-0 items-center gap-1.5">
        {isMine && !editing && (
          <button
            title="操作"
            onClick={(e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              setMenu({ x: Math.min(r.left, window.innerWidth - 170), y: r.bottom + 4 })
            }}
            className="rounded px-1 text-stone-400 opacity-0 hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100 max-md:opacity-50"
          >
            ⋯
          </button>
        )}
        {resolved && (
          <span className="rounded-full bg-blue-100 px-2 py-px text-xs text-blue-700">
            已解决{isCreator ? ' · 等你关闭' : ''}
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
            className="rounded-md border border-blue-600 px-2 py-px text-xs text-blue-700 opacity-0 group-hover:opacity-100 hover:bg-blue-600 hover:text-white"
          >
            关闭我派的原件
          </button>
        )}
      </span>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div
            className="fixed z-50 w-40 rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-xl"
            style={{ left: menu.x, top: menu.y }}
          >
            <button
              className="block w-full px-3 py-1.5 text-left hover:bg-stone-50"
              onClick={() => { setMenu(null); setText(entry.content); setEditing(true) }}
            >
              ✏️ 编辑
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-stone-50" onClick={togglePrivate}>
              {entry.is_private ? '👁 设为公开' : '🔒 仅自己可见'}
            </button>
            <button className="block w-full px-3 py-1.5 text-left hover:bg-stone-50" onClick={toggleGoal}>
              {entry.is_goal ? '¶ 转为备忘' : '☐ 转为目标'}
            </button>
            {Object.keys(SECTION_LABELS)
              .filter((s) => s !== entry.section)
              .map((s) => (
                <button key={s} className="block w-full px-3 py-1.5 text-left hover:bg-stone-50" onClick={() => moveTo(s)}>
                  → 移到{SECTION_LABELS[s]}
                </button>
              ))}
            {isCreator && (
              <button className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50" onClick={remove}>
                删除
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
