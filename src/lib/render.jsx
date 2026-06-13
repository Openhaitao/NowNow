import { mentionSplitRegex } from './mentions'
import { DATE_TOKEN_RE, dateTokenState, resolveDateToken } from './dates'

// 日期高亮：背景紧贴文字、零横向内边距、字号同正文——编辑态着色层用同一套，
// 显示↔编辑切换时宽度一个像素都不变
export const DATE_CHIP_CLS = {
  overdue: 'rounded-md bg-red-100 text-red-700',
  today: 'rounded-md bg-amber-200 text-amber-900',
  future: 'rounded-md bg-amber-100 text-amber-700',
}

// 日期 token → 黄色 chip（过期红 / 今天深黄 / 未来浅黄）；可点击改/删
function renderDates(text, keyBase, onDateClick, q) {
  return text.split(DATE_TOKEN_RE).map((part, i) => {
    const k = `${keyBase}d${i}`
    if (!part) return null
    const state = dateTokenState(part) // 整段恰好是日期 token 才命中，普通文字返回 null
    if (!state) return renderInline(part, k, q)
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

// 搜索命中的字串 → 黄色 mark（只亮命中的字，不亮整行）
function hl(text, q, keyBase) {
  if (!q) return text
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(${esc})`, 'gi')
  return text.split(re).map((seg, i) =>
    seg.toLowerCase() === q.toLowerCase() ? (
      <mark key={`${keyBase}h${i}`} className="rounded-md bg-yellow-200">{seg}</mark>
    ) : (
      seg
    ),
  )
}

// 行内 Markdown：**粗体** __下划线__ ~~删除线~~ `代码` *斜体*（doc M3 的最小集）
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*)/g

function renderInline(text, keyBase, q) {
  return text.split(INLINE).map((part, i) => {
    const k = `${keyBase}-${i}`
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <b key={k}>{hl(part.slice(2, -2), q, k)}</b>
    if (part.startsWith('__') && part.endsWith('__')) return <u key={k}>{hl(part.slice(2, -2), q, k)}</u>
    if (part.startsWith('~~') && part.endsWith('~~')) return <s key={k}>{hl(part.slice(2, -2), q, k)}</s>
    if (part.startsWith('`') && part.endsWith('`'))
      return (
        <code key={k} className="rounded-md bg-stone-100 px-1 text-[13px]">
          {hl(part.slice(1, -1), q, k)}
        </code>
      )
    if (part.startsWith('*') && part.endsWith('*')) return <i key={k}>{hl(part.slice(1, -1), q, k)}</i>
    return hl(part, q, k)
  })
}

// 完整渲染：标题前缀（#/##）→ 加粗加大；@token 高亮；日期 chip 可点；其余行内 md
// 派活状态长在 @名字 的"下划线"里：不加任何字符、不占宽度、编辑态光标也不歪
// 虚线灰=未认领 实线蓝=已认领 蓝色标记=已解决 红删除线=已拒绝
export const MENTION_STATE = {
  unclaimed: { cls: 'underline decoration-stone-300 decoration-dashed underline-offset-2', tip: '未认领' },
  claimed: { cls: 'underline decoration-blue-500 decoration-2 underline-offset-2', tip: '已认领' },
  resolved: { cls: 'rounded-sm bg-blue-50 px-0.5 underline decoration-blue-500 decoration-2 underline-offset-2', tip: '已解决' },
  rejected: { cls: 'line-through decoration-red-400 decoration-2', tip: '已拒绝' },
}

export function renderEntryContent(content, profiles, { meHandle, highlightMe, mutedMentions, onDateClick, searchTerm, mentionStates } = {}) {
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
      const st = MENTION_STATE[mentionStates?.[part.slice(1).toLowerCase()]]
      return (
        <span
          key={i}
          title={st?.tip}
          className={mutedMentions ? 'font-semibold text-inherit' : (isMe && highlightMe ? 'mention-me ' : 'mention ') + (st?.cls || '')}
        >
          {part}
        </span>
      )
    }
    return renderDates(part, i, onDateClick, searchTerm)
  })

  if (heading === 1) return <span className="text-[17px] font-bold">{nodes}</span>
  if (heading >= 2) return <span className="text-[15.5px] font-semibold">{nodes}</span>
  return nodes
}
