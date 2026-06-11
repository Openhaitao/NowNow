import { useEffect, useMemo, useRef, useState } from 'react'
import { Lock, Search } from 'lucide-react'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

export default function SearchModal({ open, onClose, allEntries, profiles, onJump }) {
  const [q, setQ] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQ('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return allEntries
      .filter((e) => e.content.toLowerCase().includes(needle))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
      .slice(0, 50)
  }, [q, allEntries])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[15vh]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-stone-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-stone-100 px-3.5 py-2.5">
          <Search size={15} className="text-stone-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
            placeholder="搜索所有人的条目…"
            className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-stone-300"
          />
          <kbd className="rounded border border-stone-200 px-1.5 text-[11px] text-stone-400">esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {q.trim() && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-stone-400">没找到「{q}」</p>
          )}
          {results.map((e) => {
            const owner = profiles.find((p) => p.id === e.owner)
            return (
              <button
                key={e.id}
                onClick={() => { onJump(e); onClose() }}
                className="block w-full px-4 py-2 text-left hover:bg-stone-50"
              >
                <span className={'text-[14px] ' + (e.status === 'closed' ? 'text-stone-300 line-through' : '')}>
                  {e.content.slice(0, 60)}
                </span>
                <span className="mt-0.5 block text-[11.5px] text-stone-400">
                  {owner?.display_name} · {SECTION_LABELS[e.section]}
                  {e.anchor ? ` · ${e.anchor}` : ''}
                  {e.is_private && <Lock size={10} className="ml-1 inline -translate-y-px" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
