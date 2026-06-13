// 老数据迁移：把"每行一个 entry"的内容转成一份 Tiptap/ProseMirror 文档 JSON。
// 行内标记 **粗** ==高亮== __下划线__ ~~删除~~ `码` *斜* + @提及 → PM marks/nodes；
// 行首 # / > / - / 1. → heading / blockquote / list；连续列表项合并成一个 list。
import { mentionSplitRegex } from './mentions'

const INLINE = /(\*\*[^*]+\*\*|==[^=]+==|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\s][^*]*\*)/g

// 一个行内标记 token → [markType, 内部文字]；非 token → [null, 原文]
function markFor(token) {
  if (token.startsWith('**') && token.endsWith('**')) return ['bold', token.slice(2, -2)]
  if (token.startsWith('==') && token.endsWith('==')) return ['highlight', token.slice(2, -2)]
  if (token.startsWith('__') && token.endsWith('__')) return ['underline', token.slice(2, -2)]
  if (token.startsWith('~~') && token.endsWith('~~')) return ['strike', token.slice(2, -2)]
  if (token.startsWith('`') && token.endsWith('`')) return ['code', token.slice(1, -1)]
  if (token.startsWith('*') && token.endsWith('*')) return ['italic', token.slice(1, -1)]
  return [null, token]
}

function pushText(out, text, mark) {
  if (!text) return
  const node = { type: 'text', text }
  if (mark) node.marks = [{ type: mark }]
  out.push(node)
}

function inlineMarks(text, out) {
  for (const part of text.split(INLINE)) {
    if (!part) continue
    const [mark, inner] = markFor(part)
    pushText(out, mark ? inner : part, mark)
  }
}

// 一行文字 → PM 行内节点数组（含 @mention 节点）。空 → null（块内容省略 = 空块）
export function inlineToPM(text, profiles = []) {
  const out = []
  const re = mentionSplitRegex(profiles)
  const parts = re ? text.split(re) : [text]
  for (const part of parts) {
    if (!part) continue
    const hit = part.startsWith('@') && profiles.find((p) => '@' + p.handle === part.toLowerCase())
    if (hit) out.push({ type: 'mention', attrs: { id: hit.id, label: hit.handle } })
    else inlineMarks(part, out)
  }
  return out.length ? out : null
}

// 一条 entry → 一个块节点（list 项先打标记 _list，留给上层合并）
function entryToBlock(content, profiles) {
  const heading = /^(#{1,3})\s+/.exec(content)
  if (heading) {
    const c = inlineToPM(content.slice(heading[0].length), profiles)
    return { type: 'heading', attrs: { level: heading[1].length }, ...(c ? { content: c } : {}) }
  }
  if (/^>\s+/.test(content)) {
    const c = inlineToPM(content.replace(/^>\s+/, ''), profiles)
    return { type: 'blockquote', content: [{ type: 'paragraph', ...(c ? { content: c } : {}) }] }
  }
  const bullet = /^[-*]\s+/.exec(content)
  if (bullet) return { _list: 'bulletList', text: content.slice(bullet[0].length) }
  const ordered = /^\d+\.\s+/.exec(content)
  if (ordered) return { _list: 'orderedList', text: content.slice(ordered[0].length) }
  const c = inlineToPM(content, profiles)
  return { type: 'paragraph', ...(c ? { content: c } : {}) }
}

// 一组同周期的 entries → 一份 PM doc JSON（按 position 排序，连续列表项合并）
export function entriesToDoc(entries, profiles = []) {
  const sorted = [...entries].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const blocks = []
  let curList = null // { type, node }
  const flush = () => { if (curList) { blocks.push(curList.node); curList = null } }
  for (const e of sorted) {
    const b = entryToBlock(e.content || '', profiles)
    if (b._list) {
      const c = inlineToPM(b.text, profiles)
      const li = { type: 'listItem', content: [{ type: 'paragraph', ...(c ? { content: c } : {}) }] }
      if (curList && curList.type === b._list) curList.node.content.push(li)
      else { flush(); curList = { type: b._list, node: { type: b._list, content: [li] } } }
    } else {
      flush()
      blocks.push(b)
    }
  }
  flush()
  return { type: 'doc', content: blocks.length ? blocks : [{ type: 'paragraph' }] }
}
