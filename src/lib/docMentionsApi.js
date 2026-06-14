// docs 世界的 @通知读取：doc_mentions = 别人在自己文档里 @ 了我（纯通知，无任务流）。
// 写入在 docsApi.saveDoc 后的 syncDocMentions；这里只读 + 标已读。
import { supabase } from './supabase'

// 我收到的 @：join docs 拿 (owner, section, period_key) 用于跳转/上下文。降序。
export async function loadMyMentions() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('doc_mentions')
    .select('id, doc_id, author, created_at, read_at, docs!inner(owner, section, period_key)')
    .eq('mentioned', user.id)
    .is('completed_at', null) // 已完成的从收件箱移除（派活闭环）
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    author: m.author,
    created_at: m.created_at,
    read_at: m.read_at,
    owner: m.docs.owner,
    section: m.docs.section,
    periodKey: m.docs.period_key,
  }))
}

export async function markMentionRead(id) {
  const { error } = await supabase
    .from('doc_mentions')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// 被@人勾「完成」（派活闭环）：写 completed_at，从我收件箱消失、发起人收到黄色完成通知。
export async function completeMention(id) {
  const { error } = await supabase.rpc('complete_mention', { p_id: id })
  if (error) throw error
}

// 我派出去、对方已完成的活（黄色「X 完成了你派的任务」），未点掉的。降序。
export async function loadMyCompletions() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('doc_mentions')
    .select('id, mentioned, completed_at, docs!inner(owner, section, period_key)')
    .eq('author', user.id)
    .not('completed_at', 'is', null)
    .is('completion_seen_at', null)
    .order('completed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((m) => ({
    id: m.id,
    mentioned: m.mentioned,
    completed_at: m.completed_at,
    owner: m.docs.owner,
    section: m.docs.section,
    periodKey: m.docs.period_key,
  }))
}

// 作者点掉黄色完成通知（写 completion_seen_at）。
export async function ackCompletion(id) {
  const { error } = await supabase.rpc('ack_completion', { p_id: id })
  if (error) throw error
}
