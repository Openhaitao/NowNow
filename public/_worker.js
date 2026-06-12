// Cloudflare Pages worker：把 Supabase 全部流量代理到同域名 /sb/* 下。
// 大陆访问 *.supabase.co 慢且不稳，而 now-now.pages.dev 本身可达——
// 让 API/认证/Realtime 全走这个域名，由 Cloudflare 边缘转发（CF→Supabase 是国际线路，快）。
const SUPABASE_ORIGIN = 'https://yklskyyirfboamhtzzhp.supabase.co'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/sb/')) {
      const target = SUPABASE_ORIGIN + url.pathname.slice(3) + url.search
      // 用原请求克隆出转发请求：方法/头/体/WebSocket upgrade 全保留
      return fetch(new Request(target, request))
    }

    // 静态资源；未命中的路径回退到 index.html（SPA 路由，如 /login）
    let res = await env.ASSETS.fetch(request)
    if (res.status === 404 && (request.headers.get('accept') || '').includes('text/html')) {
      res = await env.ASSETS.fetch(new Request(new URL('/', url), request))
    }
    return res
  },
}
