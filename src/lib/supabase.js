import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // 没配密钥时页面直接说清楚，而不是白屏
  document.getElementById('root').innerText =
    '缺少配置：请在 .env.local 里设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'
  throw new Error('missing supabase env')
}

export const supabase = createClient(url, anonKey)
