import { supabase } from './supabase'

const BUCKET = 'doc-images'

// 上传图片到 Supabase Storage（路径 {uploaderId}/时间戳-随机.ext），返回公开 URL。
// 插入文档时只在 doc_json 存这个 URL，不把图片塞进 JSON。
export async function uploadImage(file, uploaderId) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${uploaderId}/${Date.now()}-${rand}.${ext}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  })
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
