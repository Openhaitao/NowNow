import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { mentionSplitRegex, syncMentions } from '../lib/mentions'
import MentionInput from './MentionInput'

export default function EntryRow({ entry, me, profiles, allEntries, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.content)
  const [menu, setMenu] = useState(null) // {x,y} | null

  const isMine = entry.owner === me.id
  const isCreator = entry.creator === me.id
  const closed = entry.status === 'closed'
  const resolved = entry.status === 'resolved'

  // 认领副本 → 找到原条目（用于：副本勾选回流原件 / 在对方页面给 creator 关闭入口）
  const original = entry.source_entry ? allEntries.find((e) => e.id === entry.source_entry) : null
  const canCloseOriginal = original && original.creator === me.id && original.status === 'resolved'

  async function saveEdit() {
    setEditing(false)
    const t = text.trim()
    if (!t || t === entry.content) { setText(entry.content); return }
    await supabase.from('entries').update({ content: t }).eq('id', entry.id)
    await syncMentions(entry.id, t, profiles, me.id)
    onChanged()
  }

  async function toggleDone() {
    const next = closed ? 'open' : 'closed'
    if (entry.source_entry && next === 'closed') {
      await supabase.rpc('resolve_entry', { p_entry_id: entry.source_entry })
    }
    await supabase.from('entries').update({ status: next }).eq('id', entry.id)
    onChanged()
  }

  async function closeOriginal() {
    await supabase.from('entries').update({ status: 'closed' }).eq('id', original.id)
    onChanged()
  }

  async function closeSelf() {
    await supabase.from('entries').update({ status: 'closed' }).eq('id', entry.id)
    onChanged()
  }

  async function togglePrivate() {
    setMenu(null)
    await supabase.from('entries').update({ is_private: !entry.is_private }).eq('id', entry.id)
    onChanged()
  }

  async function toggleGoal() {
    setMenu(null)
    await supabase.from('entries').update({ is_goal: !entry.is_goal, status: 'open' }).eq('id', entry.id)
    onChanged()
  }

  async function remove() {
    setMenu(null)
    await supabase.from('entries').delete().eq('id', entry.id)
    onChanged()
  }

  const splitRe = mentionSplitRegex(profiles)
  const rendered = splitRe
    ? entry.content.split(splitRe).map((part, i) => {
        if (!part || !part.startsWith('@')) return part
        const isMe = part.slice(1).toLowerCase() === me.handle
        return (
          <span key={i} className={isMe && !isMine ? 'mention-me' : 'mention'}>
            {part}
          </span>
        )
      })
    : entry.content

  return (
    <div
      className={
        'entry-row group flex items-start gap-2.5 py-[5px] text-[14.5px] leading-relaxed ' +
        (closed ? 'text-stone-300' : resolved ? 'rounded-md bg-blue-50/60 -mx-2 px-2' : '')
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
          checked={closed}
          disabled={!isMine}
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
          profiles={profiles}
          autoFocus
        />
      ) : (
        <span
          className={'min-w-0 flex-1 whitespace-pre-wrap ' + (closed ? 'line-through' : '')}
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
            className="rounded px-1 text-stone-400 opacity-0 transition-opacity hover:bg-stone-100 hover:text-stone-600 group-hover:opacity-100 max-md:opacity-50"
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
