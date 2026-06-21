import { supabase } from './supabase'

export const DEFAULT_TAG_ID = 'default'
export const ALL_TAG_ID = 'all'
export const DEFAULT_TAG = { id: DEFAULT_TAG_ID, tagId: null, name: '全部', sort_order: -1, isDefault: true }

function normalizeTag(row) {
  return {
    id: row.id,
    tagId: row.id,
    owner: row.owner,
    name: row.name,
    sort_order: row.sort_order ?? 0,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function missingTagTable(error) {
  const msg = `${error?.message || ''} ${error?.details || ''}`
  return msg.includes('doc_tags') || msg.includes('schema cache') || msg.includes('relation') || error?.code === '42P01'
}

// 标签属于页面 owner。默认标签是虚拟标签，不落表；doc_tags 只存用户自建标签。
export async function loadDocTags(owner) {
  const { data, error } = await supabase
    .from('doc_tags')
    .select('id, owner, name, sort_order, archived_at, created_at, updated_at')
    .eq('owner', owner)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) {
    if (missingTagTable(error)) return { tags: [DEFAULT_TAG], ready: false }
    throw error
  }
  const tags = [DEFAULT_TAG, ...(data ?? []).map(normalizeTag)]
  return { tags, ready: true }
}

export async function listTags(owner, options) {
  const { tags } = await loadDocTags(owner, options)
  return tags
}

export async function createTag(owner, name) {
  const clean = name.trim()
  if (!clean) throw new Error('标签名不能为空')
  const { data, error } = await supabase
    .from('doc_tags')
    .insert({ owner, name: clean })
    .select('id, owner, name, sort_order, archived_at, created_at, updated_at')
    .single()
  if (error) throw error
  return normalizeTag(data)
}

export async function renameTag(id, name) {
  const clean = name.trim()
  if (!clean) throw new Error('标签名不能为空')
  const { data, error } = await supabase
    .from('doc_tags')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, owner, name, sort_order, archived_at, created_at, updated_at')
    .single()
  if (error) throw error
  return normalizeTag(data)
}

export async function updateTagOrder(items) {
  if (!Array.isArray(items) || items.length === 0) return
  const now = new Date().toISOString()
  for (const item of items) {
    if (!item?.id) continue
    const { error } = await supabase
      .from('doc_tags')
      .update({ sort_order: item.sort_order, updated_at: now })
      .eq('id', item.id)
    if (error) throw error
  }
}

// Phase 1 删除=归档标签，并把该标签下的内容移回默认标签，避免内容跟着隐藏。
export async function archiveTag(id) {
  const { error: moveErr } = await supabase
    .from('docs')
    .update({ tag_id: null, updated_at: new Date().toISOString() })
    .eq('tag_id', id)
  if (moveErr) throw moveErr
  const { error } = await supabase
    .from('doc_tags')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
