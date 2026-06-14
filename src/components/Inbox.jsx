import { useEffect, useState } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadMyMentions, markMentionRead } from '../lib/docMentionsApi'
import { periodHeaderFromKey } from '../lib/periodKey'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '暂存' }

// docs 世界的「@我的」：别人在自己文档里 @ 了我 → 这里列未读、点一条跳到那篇并标已读。
// 纯通知，无认领/拒绝/任务流（那套随目标模型一起删了）。
export default function Inbox({ profiles, onJumpDoc }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    const refresh = () =>
      loadMyMentions()
        .then((rows) => alive && setItems(rows.filter((r) => !r.read_at)))
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
    markMentionRead(m.id).catch(() => {})
    onJumpDoc?.(m.owner, m.section, m.periodKey)
  }

  return (
    <div className="mt-5 rounded-lg px-4 py-3" style={{ background: 'var(--accent-soft)' }}>
      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--accent)' }}>
        <InboxIcon size={13} /> @我的 · {items.length} 条
      </div>
      {items.map((m) => {
        const from = profiles?.find((p) => p.id === m.author)
        const ctx = m.section === 'stash' ? '暂存' : periodHeaderFromKey(m.section, m.periodKey)
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
