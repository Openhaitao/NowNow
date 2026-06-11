import { mentionSplitRegex } from './mentions'

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

// 完整渲染：标题前缀（#/##）→ 加粗加大；@token 高亮；其余行内 md
export function renderEntryContent(content, profiles, { meHandle, highlightMe } = {}) {
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
    return renderInline(part, i)
  })

  if (heading === 1) return <span className="text-[17px] font-bold">{nodes}</span>
  if (heading >= 2) return <span className="text-[15.5px] font-semibold">{nodes}</span>
  return nodes
}
