import { useEffect, useRef, useState } from 'react'
import { Bold, Highlighter, Italic, List, ListOrdered, Quote, Strikethrough, Underline } from 'lucide-react'
import { mentionSplitRegex } from '../lib/mentions'
import { DATE_TOKEN_RE, dateTokenState } from '../lib/dates'
import { DATE_CHIP_CLS, MENTION_STATE } from '../lib/render'

// 编辑态着色层：@人蓝、日期黄（纯颜色不带胶囊底，字宽与 textarea 完全一致才能重叠）
function colorize(text, profiles, mentionStates) {
  const re = mentionSplitRegex(profiles)
  const parts = re ? text.split(re) : [text]
  return parts.map((part, i) => {
    if (!part) return null
    if (part.startsWith('@') && profiles.some((p) => '@' + p.handle === part.toLowerCase())) {
      const st = MENTION_STATE[mentionStates?.[part.slice(1).toLowerCase()]]
      return (
        // CJK 加粗/下划线都不改变字宽，和 textarea 不会错位
        <span key={i} className={'font-semibold text-blue-600 ' + (st?.cls || '')}>
          {part}
        </span>
      )
    }
    return part.split(DATE_TOKEN_RE).map((t, j) => {
      if (!t) return null
      const st = dateTokenState(t)
      return st ? (
        // 和显示态完全同一套日期高亮（零内边距），编辑时胶囊不消失、宽度不变
        <span key={`${i}-${j}`} className={DATE_CHIP_CLS[st]}>{t}</span>
      ) : (
        <span key={`${i}-${j}`}>{t}</span>
      )
    })
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
  mentionStates,
  fontClass = 'text-[14px]', // 目标块用 16px、纯文字 14px；编辑层和显示层同号防光标跳
}) {
  const ref = useRef(null)
  const [picker, setPicker] = useState(null) // {start, query} | null
  const [active, setActive] = useState(0)
  const [pickerPos, setPickerPos] = useState({ x: 0, y: 24 })
  const [toolbar, setToolbar] = useState(null) // 选区悬浮格式条 {start, end, x, y} | null

  // 把选择器定位到 @ 字符的正下方（canvas 量文字宽度，无需镜像 DOM）
  function caretXY(text, idx) {
    const el = ref.current
    if (!el) return { x: 0, y: 24 }
    const cs = getComputedStyle(el)
    const ctx = (caretXY._ctx ||= document.createElement('canvas').getContext('2d'))
    ctx.font = `${cs.fontSize} ${cs.fontFamily}`
    const lineStart = text.lastIndexOf('\n', idx - 1) + 1
    const w = ctx.measureText(text.slice(lineStart, idx)).width
    const lines = text.slice(0, idx).split('\n').length - 1
    const lh = parseFloat(cs.lineHeight) || 24
    return { x: Math.max(0, Math.min(w, el.clientWidth - 150)), y: (lines + 1) * lh + 4 }
  }

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
    const pk = detectPicker(e.target.value, e.target.selectionStart)
    setPicker(pk)
    if (pk) setPickerPos(caretXY(e.target.value, pk.start))
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

  // 选区悬浮格式条：选中文字时浮出，点按钮给选区加/包 md 标记（没选区就收起）
  function refreshToolbar() {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart, e = el.selectionEnd
    if (s == null || s === e) { setToolbar(null); return }
    const cs = getComputedStyle(el)
    const lh = parseFloat(cs.lineHeight) || 24
    const lines = el.value.slice(0, s).split('\n').length - 1
    const { x: rawX } = caretXY(el.value, s)
    // 工具条约 330px 宽，夹在输入框内不溢出右边
    const x = Math.max(0, Math.min(rawX, el.clientWidth - 330))
    // 浮在选区上方一行；顶到容器外就改放下方
    const above = lines * lh - 40
    const y = above < 0 ? (lines + 1) * lh + 6 : above
    setToolbar({ start: s, end: e, x, y })
  }

  // 包裹型行内标记（**粗** ==高亮== __下划线__ ~~删除~~ *斜体*）：选区两端同号
  function wrapSel(mk) {
    if (!toolbar) return
    const { start, end } = toolbar
    const next = value.slice(0, start) + mk + value.slice(start, end) + mk + value.slice(end)
    onChange(next)
    const ns = start + mk.length, ne = end + mk.length
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus(); el.setSelectionRange(ns, ne); refreshToolbar()
    })
  }

  // 行前缀型块标记（- 项目符号 / 1. 编号 / > 引用）：加在选区所在行的行首
  function prefixSel(pfx) {
    if (!toolbar) return
    const { start, end } = toolbar
    const ls = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, ls) + pfx + value.slice(ls)
    onChange(next)
    const ns = start + pfx.length, ne = end + pfx.length
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      el.focus(); el.setSelectionRange(ns, ne); refreshToolbar()
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
          'pointer-events-none absolute inset-0 select-none whitespace-pre-wrap break-words leading-relaxed ' +
          fontClass + ' ' +
          (className || '')
        }
      >
        {colorize(value, profiles, mentionStates)}
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
        onSelect={refreshToolbar}
        onBlur={() => { setTimeout(() => { setPicker(null); setToolbar(null) }, 150); onBlur?.() }}
        className={
          'colored-input relative block w-full resize-none overflow-hidden border-0 bg-transparent p-0 leading-relaxed text-transparent caret-stone-800 outline-none placeholder:text-stone-300 ' +
          fontClass + ' ' +
          (className || '')
        }
      />
      {picker && candidates.length > 0 && (
        <div
          className="absolute z-30 w-36 rounded-lg border border-stone-200 bg-white p-1 shadow-xl"
          style={{ left: pickerPos.x, top: pickerPos.y }}
        >
          {candidates.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(p) }}
              className={
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm ' +
                (i === active ? 'bg-blue-50 text-blue-700' : 'text-stone-700')
              }
            >
              <span>{p.display_name}</span>
            </button>
          ))}
        </div>
      )}
      {toolbar && !picker && (
        <div
          className="absolute z-30 flex items-center gap-0.5 rounded-lg border border-stone-200 bg-white p-1 text-stone-600 shadow-xl"
          style={{ left: Math.max(0, toolbar.x - 8), top: toolbar.y }}
        >
          {[
            { icon: Bold, fn: () => wrapSel('**'), title: '加粗' },
            { icon: Highlighter, fn: () => wrapSel('=='), title: '高亮' },
            { icon: Underline, fn: () => wrapSel('__'), title: '下划线' },
            { icon: Strikethrough, fn: () => wrapSel('~~'), title: '删除线' },
            { icon: Italic, fn: () => wrapSel('*'), title: '斜体' },
            { sep: true },
            { icon: List, fn: () => prefixSel('- '), title: '项目符号' },
            { icon: ListOrdered, fn: () => prefixSel('1. '), title: '编号' },
            { icon: Quote, fn: () => prefixSel('> '), title: '引用' },
          ].map((b, i) =>
            b.sep ? (
              <span key={i} className="mx-0.5 h-4 w-px bg-stone-200" />
            ) : (
              <button
                key={i}
                type="button"
                title={b.title}
                onMouseDown={(e) => { e.preventDefault(); b.fn() }}
                className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100 hover:text-stone-900"
              >
                <b.icon size={15} strokeWidth={2.2} />
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
