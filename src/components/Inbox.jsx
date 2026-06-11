import { useState } from 'react'
import { ChevronDown, ChevronUp, Inbox as InboxIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

export default function Inbox({ mentions: rawMentions, profiles, onChanged }) {
  const [expandedId, setExpandedId] = useState(null)
  const [claimedIds, setClaimedIds] = useState([]) // 乐观隐藏：点了认领立刻从收件箱消失
  const mentions = rawMentions.filter((m) => !claimedIds.includes(m.id))
  if (mentions.length === 0) return null

  function claim(m, section) {
    setExpandedId(null)
    setClaimedIds((ids) => [...ids, m.id])
    supabase.rpc('claim_mention', { p_mention_id: m.id, p_section: section }).then(onChanged)
  }

  return (
    <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3">
      <div className="mb-1.5 flex items-center gap-1 text-xs font-medium text-blue-700">
        <InboxIcon size={13} /> @我的 · {mentions.length} 条待认领
      </div>
      {mentions.map((m) => {
        const from = profiles.find((p) => p.id === m.entries?.creator)
        const expanded = expandedId === m.id
        return (
          <div key={m.id} className="py-1">
            <div className="flex items-center gap-2 text-[13.5px] text-blue-900">
              <span className="min-w-0 flex-1">
                <b>{from?.display_name || '?'}：</b>
                {m.entries?.content}
              </span>
              <button
                onClick={() => setExpandedId(expanded ? null : m.id)}
                className={
                  'shrink-0 rounded-md border border-blue-600 px-2.5 py-0.5 text-xs ' +
                  (expanded ? 'bg-blue-600 text-white' : 'bg-white text-blue-700 hover:bg-blue-600 hover:text-white')
                }
              >
                认领 {expanded ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />}
              </button>
            </div>
            {expanded && (
              <div className="mt-1.5 flex justify-end gap-1.5">
                {SECTIONS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => claim(m, s.key)}
                    className="rounded-md bg-white px-2.5 py-1 text-xs text-blue-700 shadow-sm hover:bg-blue-600 hover:text-white"
                  >
                    认领到{s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
