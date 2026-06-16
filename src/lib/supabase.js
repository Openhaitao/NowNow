import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // 没配密钥时页面直接说清楚，而不是白屏
  document.getElementById('root').innerText =
    '缺少配置：请在 .env.local 里设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'
  throw new Error('missing supabase env')
}

// 大陆直连 *.supabase.co 慢且不稳：线上走同域名 /sb 代理（Cloudflare 边缘转发），本地开发直连
const base =
  typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? window.location.origin + '/sb'
    : url

// 给需要自己拼请求的地方用（如带上传进度的 XHR 上传，见 storage.js）。anonKey 是公开值、可安全暴露。
export const supabaseBase = base
export const supabaseAnonKey = anonKey

export const supabase = createClient(base, anonKey)
