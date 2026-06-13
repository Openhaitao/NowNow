// docs 表读写：一份文档 = 一个 (owner, section, period_key)。
// doc_json = ProseMirror JSON（真源，协作上线后退化为 Y.Doc 的派生投影）；doc_text = 纯文本投影（搜索）。
import { supabase } from './supabase'

// 读某人某周期的文档（看自己或别人的页都走这；RLS 团队可读）。无则 null。
export async function loadDoc(owner, section, periodKey) {
  const { data, error } = await supabase
    .from('docs')
    .select('doc_json, updated_at')
    .eq('owner', owner)
    .eq('section', section)
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) throw error
  return data?.doc_json ?? null
}

// upsert 自己的文档（RLS：owner 必须 = auth.uid()）。空文档也存，保持"今天那篇"存在。
export async function saveDoc({ owner, section, periodKey, json, text }) {
  const { error } = await supabase.from('docs').upsert(
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
  if (error) throw error
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
