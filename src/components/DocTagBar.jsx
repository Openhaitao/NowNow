import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'

export default function DocTagBar({ tags, selectedId, editable, ready, onSelect, onCreate, onDelete }) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const inputRef = useRef(null)
  const committingRef = useRef(false)
  const items = tags
  const hasTags = items.length > 0
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

  async function commitDraft() {
    if (committingRef.current) return
    const name = draft.trim()
    if (!name) {
      setCreating(false)
      return
    }
    committingRef.current = true
    try {
      await onCreate(name)
      setDraft('')
      setCreating(false)
    } finally {
      committingRef.current = false
    }
  }

  function submitDraft(e) {
    e.preventDefault()
    commitDraft()
  }

  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {items.map((tag) => {
          const active = selectedId === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelect(active ? null : tag.id)}
              className={
                'shrink-0 rounded-full px-3 py-0.5 text-[13px] leading-none transition-colors ' +
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
              onBlur={commitDraft}
              placeholder="新标签"
              className="h-6 w-24 rounded-full border border-stone-200 bg-white px-3 text-[13px] text-stone-800 outline-none focus:border-stone-300"
            />
          </form>
        )}
      </div>
      {editable && ready && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!hasTags) {
                setCreating(true)
                return
              }
              setMenuOpen((v) => !v)
            }}
            disabled={!ready}
            title={ready ? (hasTags ? '标签管理' : '新建标签') : '标签数据准备中'}
            className={
              'flex h-6 items-center justify-center bg-[var(--nav-soft)] text-stone-500 hover:text-stone-900 disabled:opacity-40 ' +
              (hasTags ? 'w-9 rounded-md' : 'w-7 rounded-full')
            }
          >
            {hasTags ? <MoreHorizontal size={16} /> : <Plus size={16} />}
          </button>
          {hasTags && menuOpen && (
            <div className="absolute right-0 top-7 z-30 w-28 rounded-lg border border-stone-200 bg-white p-1 text-[13px] shadow-lg">
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
                  删除标签
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
