import { useEffect, useState } from 'react'
import { AtSign, Bell, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadMyMentions, markMentionRead } from '../lib/docMentionsApi'
import { periodHeaderFromKey } from '../lib/periodKey'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '暂存' }

// docs 世界的通知中心：① @我的（别人在文档里 @ 我）② 待确认成员。
// 旧的「已解决 / 待认领」任务流随目标模型删除。
export default function NotificationsPage({ pendingMembers = [], profiles, onMembersChanged, onJumpDoc }) {
  const [mentions, setMentions] = useState([])

  useEffect(() => {
    let alive = true
    loadMyMentions()
      .then((rows) => alive && setMentions(rows))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function approve(p, ok) {
    await supabase.rpc(ok ? 'approve_member' : 'reject_member', { p_id: p.id })
    onMembersChanged?.()
  }

  function openMention(m) {
    if (!m.read_at) markMentionRead(m.id).catch(() => {})
    setMentions((xs) => xs.map((x) => (x.id === m.id ? { ...x, read_at: x.read_at || new Date().toISOString() } : x)))
    onJumpDoc?.(m.owner, m.section, m.periodKey)
  }

  const empty = mentions.length === 0 && pendingMembers.length === 0

  return (
    <div className="pt-1">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold max-md:text-[17px]">
        <Bell size={16} /> 通知
      </div>

      {empty && (
        <p className="mt-6 text-sm text-stone-300 max-md:text-[15px]">
          没有新通知。别人在文档里 @ 你、申请加入的成员，都会出现在这里。
        </p>
      )}

      {pendingMembers.length > 0 && (
        <div className="mt-5 rounded-lg bg-emerald-50 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-emerald-700 max-md:text-[13px]">
            <UserPlus size={13} /> 待确认成员 · {pendingMembers.length}
          </div>
          {pendingMembers.map((p) => (
            <div key={p.id} className="flex items-center gap-2 py-1 text-[13.5px] max-md:py-1.5 max-md:text-[15.5px] text-emerald-900">
              <span className="min-w-0 flex-1">
                <b>{p.display_name}</b> 通过你的邀请链接申请加入
              </span>
              <button
                onClick={() => approve(p, true)}
                className="shrink-0 rounded-md border border-emerald-600 bg-white px-2.5 py-0.5 text-xs text-emerald-700 max-md:py-1 max-md:text-[13px] hover:bg-emerald-600 hover:text-white"
              >
                通过
              </button>
              <button
                onClick={() => approve(p, false)}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs text-stone-400 hover:text-red-600"
              >
                拒绝
              </button>
            </div>
          ))}
        </div>
      )}

      {mentions.length > 0 && (
        <div className="mt-5 rounded-lg px-4 py-3" style={{ background: 'var(--surface)' }}>
          <div className="mb-1.5 flex items-center gap-1 text-xs font-medium max-md:text-[13px]" style={{ color: 'var(--accent)' }}>
            <AtSign size={13} /> @我的 · {mentions.length}
          </div>
          {mentions.map((m) => {
            const from = profiles?.find((p) => p.id === m.author)
            const ctx = m.section === 'stash' ? '暂存' : periodHeaderFromKey(m.section, m.periodKey)
            return (
              <button
                key={m.id}
                onClick={() => openMention(m)}
                className="flex w-full items-center gap-2 py-1 text-left text-[13.5px] max-md:py-1.5 max-md:text-[15.5px] hover:underline"
                style={{ color: m.read_at ? 'var(--ink-faint)' : 'var(--ink-muted)' }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <b style={{ color: m.read_at ? 'var(--ink-faint)' : 'var(--ink)' }}>{from?.display_name || '有人'}</b> 在「{SECTION_LABELS[m.section]}」@了你
                </span>
                <span className="shrink-0 text-[11.5px]" style={{ color: m.read_at ? 'var(--ink-faint)' : 'var(--accent)' }}>{ctx} · 去看看</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
