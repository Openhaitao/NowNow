import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

export default function DocTagBar({ tags, selectedId, editable, ready, onSelect, onCreate, onMove }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)
  const items = tags
  const selectedCustomIndex = tags.findIndex((tag) => tag.id === selectedId)
  const canMoveLeft = selectedCustomIndex > 0
  const canMoveRight = selectedCustomIndex >= 0 && selectedCustomIndex < tags.length - 1

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  async function submitDraft(e) {
    e.preventDefault()
    const name = draft.trim()
    if (!name) {
      setCreating(false)
      return
    }
    await onCreate(name)
    setDraft('')
    setCreating(false)
  }

  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {items.map((tag) => {
          const active = selectedId === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelect(active ? null : tag.id)}
              className={
                'shrink-0 rounded-full px-3 py-1 text-[13px] leading-none transition-colors ' +
                (active
                  ? 'bg-[var(--btn-bg)] font-medium text-[var(--btn-fg)]'
                  : 'bg-[var(--nav-soft)] text-stone-500 hover:text-stone-900')
              }
            >
              {tag.name}
            </button>
          )
        })}
        {creating && (
          <form onSubmit={submitDraft} className="shrink-0">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft('')
                  setCreating(false)
                }
              }}
              onBlur={() => {
                if (!draft.trim()) setCreating(false)
              }}
              placeholder="新标签"
              className="h-[25px] w-24 rounded-full border border-stone-200 bg-white px-3 text-[13px] text-stone-800 outline-none focus:border-stone-300"
            />
          </form>
        )}
      </div>
      {editable && selectedCustomIndex >= 0 && (
        <div className="hidden shrink-0 items-center gap-0.5 md:flex">
          <button
            type="button"
            disabled={!canMoveLeft}
            onClick={() => onMove(selectedId, -1)}
            title="前移"
            className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-[var(--nav-soft)] hover:text-stone-700 disabled:opacity-25"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            disabled={!canMoveRight}
            onClick={() => onMove(selectedId, 1)}
            title="后移"
            className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-[var(--nav-soft)] hover:text-stone-700 disabled:opacity-25"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
      {editable && (
        <button
          type="button"
          onClick={() => setCreating(true)}
          disabled={!ready || creating}
          title={ready ? '新建标签' : '标签数据准备中'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nav-soft)] text-stone-500 hover:text-stone-900 disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
      )}
    </div>
  )
}
