import { useEffect, useRef, useState } from 'react'
import { mentionSplitRegex } from '../lib/mentions'
import { DATE_TOKEN_RE, dateTokenState } from '../lib/dates'

// 编辑态着色层：@人蓝、日期黄（纯颜色不带胶囊底，字宽与 textarea 完全一致才能重叠）
function colorize(text, profiles) {
  const re = mentionSplitRegex(profiles)
  const parts = re ? text.split(re) : [text]
  return parts.map((part, i) => {
    if (!part) return null
    if (part.startsWith('@') && profiles.some((p) => '@' + p.handle === part.toLowerCase()))
      return (
        // 只改颜色不改字重——加粗会改变字宽，和底下 textarea 错位
        <span key={i} className="text-blue-600">
          {part}
        </span>
      )
    return part.split(DATE_TOKEN_RE).map((t, j) =>
      !t ? null : dateTokenState(t) ? (
        <span key={`${i}-${j}`} className="text-amber-600">{t}</span>
      ) : (
        <span key={`${i}-${j}`}>{t}</span>
      ),
    )
  })
}

// 带 @人选择器的输入框：输入 @ 弹出人员列表，选中后以 @handle 嵌入文本
export default function MentionInput({
  id,
  value,
  onChange,
  onSubmit,
  onBlur,
  onEscape,
  onEmptyBackspace,
  onTab,
  onArrowUp,
  onArrowDown,
  placeholder,
  profiles,
  autoFocus,
  className,
  rows = 1,
  initialCaret = null,
}) {
  const ref = useRef(null)
  const [picker, setPicker] = useState(null) // {start, query} | null
  const [active, setActive] = useState(0)

  // 高度手动跟随内容（textarea 不自己长高会在切换编辑时跳一下；field-sizing Safari 不支持）
  const resize = () => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }
  useEffect(resize, [value])

  // 自动聚焦：光标落在点击处（没有就放末尾），并滚进视野
  useEffect(() => {
    if (autoFocus && ref.current) {
      const len = ref.current.value.length
      const pos = initialCaret != null ? Math.min(initialCaret, len) : len
      ref.current.setSelectionRange(pos, pos)
      ref.current.scrollIntoView({ block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    if (e.key === 'Escape') {
      onEscape?.()
      return
    }
    if (e.key === 'Tab' && onTab) {
      e.preventDefault()
      onTab()
      return
    }
    // 第一行按 ↑ / 最后一行按 ↓ = 跳到上/下一条继续编辑
    if (e.key === 'ArrowUp' && onArrowUp && !value.slice(0, e.target.selectionStart).includes('\n')) {
      e.preventDefault()
      onArrowUp()
      return
    }
    if (e.key === 'ArrowDown' && onArrowDown && !value.slice(e.target.selectionEnd).includes('\n')) {
      e.preventDefault()
      onArrowDown()
      return
    }
    // 退格落在 @token 末尾 = 整个 token 一次删掉
    if (e.key === 'Backspace' && !picker) {
      const caret = e.target.selectionStart
      if (caret > 0 && caret === e.target.selectionEnd) {
        const before = value.slice(0, caret).toLowerCase()
        const hit = profiles.find((p) => before.endsWith('@' + p.handle))
        if (hit) {
          e.preventDefault()
          const tok = hit.handle.length + 1
          onChange(value.slice(0, caret - tok) + value.slice(caret))
          requestAnimationFrame(() => ref.current?.setSelectionRange(caret - tok, caret - tok))
          return
        }
      }
    }
    // 删空了再按一下退格 = 删掉这条、跳回上一条（block 编辑器行为）
    if (e.key === 'Backspace' && value === '' && onEmptyBackspace) {
      e.preventDefault()
      onEmptyBackspace()
      return
    }
    // 回车 或 ⌘/Ctrl+回车 都是确定（mac/win 通吃）；Shift+回车换行。把光标位置传出去（行中回车=分裂）
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
      e.preventDefault()
      onSubmit?.(e.target.selectionStart)
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      {/* 着色层垫在透明文字的 textarea 下面：编辑时颜色不消失 */}
      <div
        aria-hidden
        className={
          'pointer-events-none absolute inset-0 select-none whitespace-pre-wrap break-words text-[14.5px] leading-relaxed ' +
          (className || '')
        }
      >
        {colorize(value, profiles)}
      </div>
      <textarea
        id={id}
        ref={ref}
        rows={rows}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setPicker(null), 150); onBlur?.() }}
        className={
          'relative block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[14.5px] leading-relaxed text-transparent caret-stone-800 outline-none placeholder:text-stone-300 ' +
          (className || '')
        }
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
              <span>{p.display_name}</span>
              <span className="ml-auto text-xs text-stone-400">@{p.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
