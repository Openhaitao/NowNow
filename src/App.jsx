import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import Board from './Board'

import { demoProfiles, demoMe, demoEntries, demoMentions } from './demoData'

// 整个产品就两个页面：登录页 + 主页面（首次起名是主页面里的一张卡）
// ?demo = 演示模式，假数据看效果，不碰数据库
export default function App() {
  const [session, setSession] = useState(undefined)
  const isDemo = new URLSearchParams(window.location.search).has('demo')

  useEffect(() => {
    if (isDemo) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [isDemo])

  if (isDemo)
    return <Board demo={{ me: demoMe, profiles: demoProfiles, entries: demoEntries, mentions: demoMentions }} />
  if (session === undefined) return null
  return session ? <Board session={session} /> : <Login />
}
