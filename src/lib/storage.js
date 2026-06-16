import { supabase, supabaseBase, supabaseAnonKey } from './supabase'

const BUCKET = 'doc-images'

// 上传图片到 Supabase Storage（路径 {uploaderId}/时间戳-随机.ext），返回公开 URL。
// 插入文档时只在 doc_json 存这个 URL，不把图片塞进 JSON。
//
// onProgress(percent 0..100) 可选：传了就走带进度的 XHR 上传（Supabase 的 .upload() 不报进度），
// 给图片节点右上角画上传圈用。没传就走普通 client 上传。
export async function uploadImage(file, uploaderId, onProgress) {
  const ext = (file.name?.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
  const rand = Math.random().toString(36).slice(2, 8)
  const path = `${uploaderId}/${Date.now()}-${rand}.${ext}`

  if (typeof onProgress === 'function') {
    await xhrUpload(path, file, onProgress)
  } else {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })
    if (error) throw error
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

// 带上传进度的 XHR 上传：打到 Storage REST 端点（走同一个 /sb 代理 base），
// 用当前登录用户的 access_token 过 RLS（insert 策略要求 authenticated）。
async function xhrUpload(path, file, onProgress) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('未登录，无法上传')

  const url = `${supabaseBase}/storage/v1/object/${BUCKET}/${encodeURI(path)}`
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseAnonKey)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', '3600')
    if (file.type) xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve() }
      else reject(new Error(`上传失败 ${xhr.status}: ${xhr.responseText || ''}`.trim()))
    }
    xhr.onerror = () => reject(new Error('上传网络错误'))
    xhr.send(file)
  })
}
