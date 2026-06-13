import { useEffect, useState } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadMyMentions, markMentionRead } from '../lib/docMentionsApi'
import { periodHeaderFromKey } from '../lib/periodKey'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '暂存箱' }

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
    <div className="mt-5 rounded-lg bg-blue-50 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-blue-700">
        <InboxIcon size={13} /> @我的 · {items.length} 条
      </div>
      {items.map((m) => {
        const from = profiles?.find((p) => p.id === m.author)
        const ctx = m.section === 'stash' ? '暂存箱' : periodHeaderFromKey(m.section, m.periodKey)
        return (
          <button
            key={m.id}
            onClick={() => open(m)}
            className="flex w-full items-center gap-2 py-1 text-left text-[13.5px] max-md:text-[15.5px] text-blue-900 hover:underline"
          >
            <span className="min-w-0 flex-1 truncate">
              <b>{from?.display_name || '有人'}</b> 在「{SECTION_LABELS[m.section] || ''}」@了你
            </span>
            <span className="shrink-0 text-[11.5px] text-blue-500">{ctx} · 去看看</span>
          </button>
        )
      })}
    </div>
  )
}
