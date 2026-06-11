import { supabase } from '../lib/supabase'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

export default function Inbox({ mentions, profiles, onChanged }) {
  if (mentions.length === 0) return null

  async function claim(m, section) {
    await supabase.rpc('claim_mention', { p_mention_id: m.id, p_section: section })
    onChanged()
  }

  return (
    <div className="mt-5 rounded-xl bg-blue-50 px-4 py-3">
      <div className="mb-1.5 text-xs font-medium text-blue-700">
        📥 @我的 · {mentions.length} 条待认领
      </div>
      {mentions.map((m) => {
        const from = profiles.find((p) => p.id === m.entries?.creator)
        return (
          <div key={m.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-[13.5px] text-blue-900">
            <span className="min-w-0 flex-1 basis-52">
              <b>{from?.display_name || '?'}：</b>
              {m.entries?.content}
            </span>
            <span className="flex shrink-0 gap-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => claim(m, s.key)}
                  className="rounded-md border border-blue-600 bg-white px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-600 hover:text-white"
                >
                  认领到{s.label}
                </button>
              ))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
