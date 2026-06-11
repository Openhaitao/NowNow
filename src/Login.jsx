import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function sendLink(e) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-xs text-center">
        <img src="/logo.png" alt="NowNow" className="mx-auto w-16 rounded-2xl" />
        <h1 className="mt-3 text-xl font-bold">NowNow</h1>
        <p className="mt-1 text-sm text-stone-400">先是笔记，才是系统</p>
        {sent ? (
          <p className="mt-6 text-sm text-stone-600">
            登录链接已发到 <b>{email}</b>
            <br />
            去邮箱点一下就进来了。
          </p>
        ) : (
          <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="你的邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-stone-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-stone-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-blue-600 py-2.5 text-[15px] text-white hover:bg-blue-700"
            >
              发送登录链接
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
