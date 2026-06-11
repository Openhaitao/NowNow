import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import Login from './Login'
import Board from './Board'

// 整个产品就两个页面：登录页 + 主页面（首次起名是主页面里的一张卡）
export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  return session ? <Board session={session} /> : <Login />
}
