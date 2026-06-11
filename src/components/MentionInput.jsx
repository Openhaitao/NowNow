import { useRef, useState } from 'react'

// 带 @人选择器的输入框：输入 @ 弹出人员列表，选中后以 @handle 嵌入文本
export default function MentionInput({
  value,
  onChange,
  onSubmit,
  onBlur,
  placeholder,
  profiles,
  autoFocus,
  className,
}) {
  const ref = useRef(null)
  const [picker, setPicker] = useState(null) // {start, query} | null
  const [active, setActive] = useState(0)

  function detectPicker(text, caret) {
    const at = text.lastIndexOf('@', caret - 1)
    if (at === -1) return null
    const frag = text.slice(at + 1, caret)
    if (/\s/.test(frag)) return null
    return { start: at, query: frag.toLowerCase() }
  }

  const candidates = picker
    ? profiles.filter(
        (p) =>
          p.handle.toLowerCase().startsWith(picker.query) ||
          p.display_name.toLowerCase().startsWith(picker.query),
      )
    : []

  function handleChange(e) {
    onChange(e.target.value)
    setPicker(detectPicker(e.target.value, e.target.selectionStart))
    setActive(0)
  }

  function pick(p) {
    const caret = ref.current.selectionStart
    const next = value.slice(0, picker.start) + '@' + p.handle + ' ' + value.slice(caret)
    onChange(next)
    setPicker(null)
    requestAnimationFrame(() => {
      const pos = picker.start + p.handle.length + 2
      ref.current.focus()
      ref.current.setSelectionRange(pos, pos)
    })
  }

  function handleKeyDown(e) {
    if (picker && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % candidates.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + candidates.length) % candidates.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(candidates[active]); return }
      if (e.key === 'Escape') { setPicker(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit?.()
    }
  }

  return (
    <div className="relative flex-1 min-w-0">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setPicker(null), 150); onBlur?.() }}
        className={
          'w-full resize-none bg-transparent outline-none text-[14.5px] leading-relaxed placeholder:text-stone-300 ' +
          (className || '')
        }
        style={{ fieldSizing: 'content' }}
      />
      {picker && candidates.length > 0 && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-stone-200 bg-white py-1 shadow-lg">
          {candidates.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p) }}
              className={
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ' +
                (i === active ? 'bg-blue-50 text-blue-700' : 'text-stone-700')
              }
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[10px] text-blue-700">
                {p.display_name[0]}
              </span>
              <span>{p.display_name}</span>
              <span className="ml-auto text-xs text-stone-400">@{p.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
