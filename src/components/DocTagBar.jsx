import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function DocTagBar({ tags, selectedId, editable, ready, onSelect, onCreate, onDelete }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const items = tags
  const selectedCustomIndex = tags.findIndex((tag) => tag.id === selectedId)

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

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
                  ? 'bg-[var(--nav-soft)] font-medium text-stone-900'
                  : 'text-stone-500 hover:bg-[var(--nav-soft)] hover:text-stone-900')
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
      {editable && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={!ready}
            title={ready ? '标签管理' : '标签数据准备中'}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--nav-soft)] text-stone-500 hover:text-stone-900 disabled:opacity-40"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-30 w-36 rounded-lg border border-stone-200 bg-white p-1 text-[13px] shadow-lg">
              <button
                type="button"
                className="block w-full rounded-md px-2.5 py-1.5 text-left text-stone-700 hover:bg-stone-100"
                onClick={() => {
                  setMenuOpen(false)
                  setCreating(true)
                }}
              >
                新建标签
              </button>
              {selectedCustomIndex >= 0 && (
                <button
                  type="button"
                  className="block w-full rounded-md px-2.5 py-1.5 text-left text-red-500 hover:bg-red-50"
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete(selectedId)
                  }}
                >
                  删除当前标签
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
