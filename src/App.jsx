import { Component, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import Board from './Board'

// 任何渲染崩溃都显示可操作的错误页，绝不白屏
class ErrorBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) {
    return { err }
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-stone-600">页面出错了：{String(this.state.err?.message || this.state.err)}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white"
        >
          刷新重试
        </button>
      </div>
    )
  }
}

// 整个产品就两个页面：登录页 + 主页面（首次起名是主页面里的一张卡）
const INVITE_KEY = 'nownow_invite'

export default function App() {
  const [session, setSession] = useState(undefined)

  // 邀请链接：?invite=token 先存起来（magic link 跳转会丢 query），登录后兑换
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('invite')
    if (t) {
      localStorage.setItem(INVITE_KEY, t)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  // /login = 调试入口：不管登没登录都显示登录页（已登录时页内有"进入主页"链接）
  if (window.location.pathname === '/login')
    return (
      <ErrorBoundary>
        <Login />
      </ErrorBoundary>
    )
  return <ErrorBoundary>{session ? <Board session={session} /> : <Login />}</ErrorBoundary>
}
