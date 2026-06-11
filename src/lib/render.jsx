import { mentionSplitRegex } from './mentions'
import { DATE_TOKEN_RE, dateTokenState, resolveDateToken } from './dates'

// 日期高亮：背景紧贴文字、零横向内边距、字号同正文——编辑态着色层用同一套，
// 显示↔编辑切换时宽度一个像素都不变
export const DATE_CHIP_CLS = {
  overdue: 'rounded bg-red-100 text-red-700',
  today: 'rounded bg-amber-200 text-amber-900',
  future: 'rounded bg-amber-100 text-amber-700',
}

// 日期 token → 黄色 chip（过期红 / 今天深黄 / 未来浅黄）；可点击改/删
function renderDates(text, keyBase, onDateClick) {
  return text.split(DATE_TOKEN_RE).map((part, i) => {
    const k = `${keyBase}d${i}`
    if (!part) return null
    const state = dateTokenState(part) // 整段恰好是日期 token 才命中，普通文字返回 null
    if (!state) return renderInline(part, k)
    const d = resolveDateToken(part)
    return (
      <span
        key={k}
        onClick={onDateClick ? (e) => onDateClick(part, e) : undefined}
        title={d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}${onDateClick ? '（点击修改）' : ''}` : ''}
        className={DATE_CHIP_CLS[state] + (onDateClick ? ' cursor-pointer hover:ring-1 hover:ring-amber-400' : '')}
      >
        {part}
      </span>
    )
  })
}

// 行内 Markdown：**粗体** __下划线__ ~~删除线~~ `代码` *斜体*（doc M3 的最小集）
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*)/g

function renderInline(text, keyBase) {
  return text.split(INLINE).map((part, i) => {
    const k = `${keyBase}-${i}`
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <b key={k}>{part.slice(2, -2)}</b>
    if (part.startsWith('__') && part.endsWith('__')) return <u key={k}>{part.slice(2, -2)}</u>
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={k}>{part.slice(2, -2)}</s>
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={k} className="rounded bg-stone-100 px-1 text-[13px]">
          {part.slice(1, -1)}
        </code>
      )
    if (part.startsWith('*') && part.endsWith('*')) return <i key={k}>{part.slice(1, -1)}</i>
    return part
  })
}

// 完整渲染：标题前缀（#/##）→ 加粗加大；@token 高亮；日期 chip 可点；其余行内 md
export function renderEntryContent(content, profiles, { meHandle, highlightMe, onDateClick } = {}) {
  let body = content
  let heading = 0
  const hm = /^(#{1,3})\s+/.exec(body)
  if (hm) {
    heading = hm[1].length
    body = body.slice(hm[0].length)
  }

  const splitRe = mentionSplitRegex(profiles)
  const parts = splitRe ? body.split(splitRe) : [body]
  const nodes = parts.map((part, i) => {
    if (!part) return null
    if (part.startsWith('@') && splitRe && profiles.some((p) => '@' + p.handle === part.toLowerCase())) {
      const isMe = meHandle && part.slice(1).toLowerCase() === meHandle
      return (
        <span key={i} className={isMe && highlightMe ? 'mention-me' : 'mention'}>
          {part}
        </span>
      )
    }
    return renderDates(part, i, onDateClick)
  })

  if (heading === 1) return <span className="text-[17px] font-bold">{nodes}</span>
  if (heading >= 2) return <span className="text-[15.5px] font-semibold">{nodes}</span>
  return nodes
}
