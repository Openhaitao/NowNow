import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
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
          <div key={m.id} className="flex items-center gap-2 py-1 text-[13.5px] text-blue-900">
            <span className="min-w-0 flex-1 truncate">
              <b>{from?.display_name || '?'}：</b>
              {m.entries?.content}
            </span>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button className="shrink-0 rounded-md border border-blue-600 bg-white px-2.5 py-0.5 text-xs text-blue-700 hover:bg-blue-600 hover:text-white">
                  认领到…
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 w-28 rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-xl"
                  sideOffset={4}
                >
                  {SECTIONS.map((s) => (
                    <DropdownMenu.Item
                      key={s.key}
                      onSelect={() => claim(m, s.key)}
                      className="cursor-pointer px-3 py-1.5 outline-none hover:bg-blue-50 data-[highlighted]:bg-blue-50"
                    >
                      {s.label}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        )
      })}
    </div>
  )
}
