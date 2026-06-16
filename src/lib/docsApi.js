// docs 表读写：一份文档 = 一个 (owner, section, period_key)。
// doc_json = ProseMirror JSON（真源，协作上线后退化为 Y.Doc 的派生投影）；doc_text = 纯文本投影（搜索）。
import { supabase } from './supabase'

// 读某人某周期的文档（看自己或别人的页都走这）。走 docs_visible 视图：
// 自己拿全文、别人拿「剥掉私密块」的 public 投影（私密块服务端就被滤掉、别人根本收不到）。无则 null。
export async function loadDoc(owner, section, periodKey) {
  const { data, error } = await supabase
    .from('docs_visible')
    .select('doc_json, updated_at')
    .eq('owner', owner)
    .eq('section', section)
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) throw error
  return data?.doc_json ?? null
}

// upsert 自己的文档（RLS：owner 必须 = auth.uid()）。空文档也存，保持"今天那篇"存在。
// 落库后顺带同步 @提及索引（doc_mentions）——通知链。表还没建时容错跳过，不影响存。
export async function saveDoc({ owner, section, periodKey, json, text }) {
  const { data, error } = await supabase
    .from('docs')
    .upsert(
      {
        owner,
        section,
        period_key: periodKey,
        doc_json: json,
        doc_text: text ?? '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner,section,period_key' },
    )
    .select('id')
    .single()
  if (error) throw error
  if (data?.id) syncDocMentions(data.id, owner, json).catch(() => {}) // 非致命：doc_mentions 没建好也不挡存
  return data?.id
}

// 取一个块的纯文本（@提及计为「@label」），并把每个 @ 节点的 {id, mid} 收进 items
function blockText(node, items) {
  if (!node) return ''
  if (node.type === 'text') return node.text || ''
  if (node.type === 'mention') {
    if (node.attrs?.id) items.push({ id: node.attrs.id, mid: node.attrs.mid || null })
    return '@' + (node.attrs?.label || '')
  }
  if (Array.isArray(node.content)) return node.content.map((c) => blockText(c, items)).join('')
  return ''
}

// 收集每个 @ 实例：{mid, mentioned, snippet}（按节点；没 mid 的老节点跳过——靠编辑器 parseHTML 兜底生成 mid）
function collectMentions(json) {
  const out = []
  for (const block of json?.content || []) {
    const items = []
    const txt = blockText(block, items).trim()
    for (const it of items) if (it.mid) out.push({ mid: it.mid, mentioned: it.id, snippet: txt.slice(0, 140) })
  }
  return out
}

// 同步 @提及索引：每个 @ 实例一行（按 mid 唯一）。现有的 upsert、文里已删的 prune。供收件箱「@我的」查询。
export async function syncDocMentions(docId, authorId, json) {
  const mentions = collectMentions(json)
  const mids = mentions.map((m) => m.mid)
  if (mentions.length) {
    // ignoreDuplicates=DO NOTHING：已存在的行不走 UPDATE（撞 update RLS 会整批报错、新@也丢）。
    // 一个 @ 实例一行、按 mention_id(=mid) 唯一；重存幂等、新@新行。snippet 是 @ 当下快照。
    await supabase
      .from('doc_mentions')
      .upsert(
        mentions.map((m) => ({ mention_id: m.mid, doc_id: docId, mentioned: m.mentioned, author: authorId, snippet: m.snippet })),
        { onConflict: 'mention_id', ignoreDuplicates: true },
      )
  }
  // prune：这篇里 mid 已不在的行删掉（删 @ / 改 @ 都靠它）
  let del = supabase.from('doc_mentions').delete().eq('doc_id', docId)
  if (mids.length) del = del.not('mention_id', 'in', `(${mids.join(',')})`)
  await del
}

// 一篇 doc_json → 纯文本投影（喂搜索/RLS），口径与编辑器一致：块内拼接、块间换行。
function docText(json) {
  return (json?.content || []).map((b) => blockText(b, [])).join('\n')
}

// 给一个节点(及子树)里所有 mention 换新 mid（深拷贝后调用）：搬到今天 = 今天重新 @ 一次。
function regenMids(node) {
  if (!node) return node
  if (node.type === 'mention' && node.attrs) node.attrs = { ...node.attrs, mid: crypto.randomUUID() }
  if (Array.isArray(node.content)) node.content.forEach(regenMids)
  return node
}

// 把过去某篇里的一个块「搬到今天」（或任意目标周期）：源篇移除该块、目标篇追加该块。
// 带 @ 的块换新 mid（= 今天重新 @ 一次、独立通知；与源篇 prune 谁先谁后无关）。两边各自 saveDoc(自动 syncDocMentions)。
// 供「⬆️ 搬到今天」用。前端传：块在源篇 content 里的 index + 源/目标周期。owner 必须是自己(RLS: owner=auth.uid())。
export async function moveBlockToToday({ owner, fromSection, fromPeriod, blockIndex, toSection = 'today', toPeriod }) {
  const fromJson = await loadDoc(owner, fromSection, fromPeriod)
  const block = fromJson?.content?.[blockIndex]
  if (!block) throw new Error('源块不存在或内容已变化，请刷新后重试')
  const toJson = (await loadDoc(owner, toSection, toPeriod)) || { type: 'doc', content: [] }

  const moved = regenMids(structuredClone(block))
  const fromNew = { ...fromJson, content: fromJson.content.filter((_, i) => i !== blockIndex) }
  const toNew = { ...toJson, content: [...(toJson.content || []), moved] }

  // 先存源(删掉该块) → 再存目标(追加)。换了 mid 顺序其实无关，先源后目更稳。
  await saveDoc({ owner, section: fromSection, periodKey: fromPeriod, json: fromNew, text: docText(fromNew) })
  await saveDoc({ owner, section: toSection, periodKey: toPeriod, json: toNew, text: docText(toNew) })
  return { ok: true }
}

// 搜 docs（团队可见的都能搜，RLS select 全可读）。命中 doc_text，返回文档 + 片段。
export async function searchDocs(query) {
  const q = query.trim()
  if (!q) return []
  const { data, error } = await supabase
    .from('docs')
    .select('id, owner, section, period_key, doc_text, updated_at')
    .ilike('doc_text', `%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data ?? []
}

// 列某人某 section 下"有内容的过去周期"（时间线渲染用：哪些 period_key 有文档，降序）。
export async function listPeriods(owner, section) {
  const { data, error } = await supabase
    .from('docs')
    .select('period_key, doc_text, updated_at')
    .eq('owner', owner)
    .eq('section', section)
    .order('period_key', { ascending: false })
  if (error) throw error
  return data ?? []
}
