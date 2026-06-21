import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { ALL_TAG_ID, ALL_TAG, DEFAULT_TAG_ID } from '../lib/tagsApi'

export default function DocTagBar({ tags, selectedId, editable, ready, onSelect, onCreate, onMove }) {
  const items = [ALL_TAG, ...tags]
  const selectedCustomIndex = tags.findIndex((tag) => tag.id === selectedId && tag.id !== DEFAULT_TAG_ID)
  const canMoveLeft = selectedCustomIndex > 1
  const canMoveRight = selectedCustomIndex >= 1 && selectedCustomIndex < tags.length - 1

  return (
    <div className="mt-2 flex min-w-0 items-center gap-1.5">
      <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {items.map((tag) => {
          const active = selectedId === tag.id
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => onSelect(tag.id)}
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
          onClick={onCreate}
          disabled={!ready}
          title={ready ? '新建标签' : '标签数据准备中'}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--nav-soft)] text-stone-500 hover:text-stone-900 disabled:opacity-40"
        >
          <Plus size={15} />
        </button>
      )}
    </div>
  )
}
