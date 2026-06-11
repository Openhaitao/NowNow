import { supabase } from './supabase'

// @匹配按已知 handle 精确比对（支持中文名，不靠"单词边界"——中文没有空格分词）
export function findMentioned(content, profiles, meId) {
  const lc = content.toLowerCase()
  return profiles.filter((p) => p.id !== meId && lc.includes('@' + p.handle))
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function mentionSplitRegex(profiles) {
  if (!profiles.length) return null
  const alt = profiles.map((p) => escapeRegExp('@' + p.handle)).join('|')
  return new RegExp(`(${alt})`, 'gi')
}

// 把条目文本里的 @ 同步进 mentions 表（幂等）
export async function syncMentions(entryId, content, profiles, meId) {
  const targets = findMentioned(content, profiles, meId)
  for (const t of targets) {
    await supabase.from('mentions').upsert(
      { entry_id: entryId, mentioned: t.id },
      { onConflict: 'entry_id,mentioned', ignoreDuplicates: true },
    )
  }
}
