import { useEffect, useState } from 'react'
import { ChevronDown, Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadMyMentions, markMentionRead } from '../lib/docMentionsApi'
import { periodHeaderFromKey } from '../lib/periodKey'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '收集箱' }

// 模块级缓存：切回自己页时先用上次的未读列表**瞬间按最终高度渲染**，不再「空→异步拉回→撑出来」抖一下。
// 按账号隔离（cachedUserId），换号登录不串上个账号的通知。后台仍会刷新成最新。
let cachedItems = []
let cachedUserId = null

// docs 世界的「@我的」：别人在自己文档里 @ 了我 → 这里列未读、点一条跳到那篇并标已读。
// 纯通知，无认领/拒绝/任务流（那套随目标模型一起删了）。
export default function Inbox({ me, profiles, onJumpDoc }) {
  const [items, setItems] = useState(() => (cachedUserId === me?.id ? cachedItems : []))
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('nownow_inbox_collapsed') === '1')
  const toggle = () => setCollapsed((v) => { localStorage.setItem('nownow_inbox_collapsed', v ? '0' : '1'); return !v })

  useEffect(() => {
    let alive = true
    const refresh = () =>
      loadMyMentions()
        .then((rows) => {
          const unread = rows.filter((r) => !r.read_at)
          cachedItems = unread
          cachedUserId = me?.id
          if (alive) setItems(unread)
        })
        .catch(() => {})
    refresh()
    // 被 @ 时实时亮（doc_mentions 已加进 realtime publication）
    const ch = supabase
      .channel('doc_mentions_inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doc_mentions' }, refresh)
      .subscribe()
    return () => {
      alive = false
      supabase.removeChannel(ch)
    }
  }, [])

  if (items.length === 0) return null

  function open(m) {
    setItems((xs) => xs.filter((x) => x.id !== m.id)) // 乐观移除
    cachedItems = cachedItems.filter((x) => x.id !== m.id) // 缓存同步，重挂不闪回这条
    markMentionRead(m.id).catch(() => {})
    onJumpDoc?.(m.owner, m.section, m.periodKey)
  }

  return (
    <div className="mt-5 rounded-lg px-4 py-3" style={{ background: 'var(--accent-soft)' }}>
      <button onClick={toggle} className={'flex w-full items-center gap-1 text-xs font-bold' + (collapsed ? '' : ' mb-1.5')} style={{ color: 'var(--accent)' }}>
        <InboxIcon size={13} /> @我的 · {items.length} 条
        <ChevronDown size={13} className={'ml-auto transition-transform ' + (collapsed ? '-rotate-90' : '')} />
      </button>
      {!collapsed && items.map((m) => {
        const from = profiles?.find((p) => p.id === m.author)
        const ctx = m.section === 'stash' ? '收集箱' : periodHeaderFromKey(m.section, m.periodKey)
        const who = from?.display_name || '有人'
        return (
          <button key={m.id} onClick={() => open(m)} className="block w-full py-1 text-left hover:opacity-80 max-md:text-[15.5px]">
            {m.snippet ? (
              <>
                <div className="truncate text-[13.5px]" style={{ color: 'var(--ink)' }}>{m.snippet}</div>
                <div className="mt-0.5 flex items-center gap-2 text-[11.5px]" style={{ color: 'var(--ink-faint)' }}>
                  <span className="min-w-0 flex-1 truncate"><b style={{ color: 'var(--ink-muted)' }}>{who}</b> @了你 · {ctx}</span>
                  <span className="shrink-0" style={{ color: 'var(--accent)' }}>去看看</span>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-[13.5px]" style={{ color: 'var(--ink-muted)' }}>
                <span className="min-w-0 flex-1 truncate"><b style={{ color: 'var(--ink)' }}>{who}</b> 在「{SECTION_LABELS[m.section] || ''}」@了你</span>
                <span className="shrink-0 text-[11.5px]" style={{ color: 'var(--accent)' }}>{ctx} · 去看看</span>
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
