import { useState } from 'react'
import { supabase } from './lib/supabase'

// 登录：邮箱+密码为主（无邮件往返、不吃邮件限额），邮件链接作备用/找回
export default function Login({ loggedIn = false }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('password') // password | link
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const invited = !!localStorage.getItem('nownow_invite')

  function humanize(m) {
    if (!m) return '出错了，再试一次'
    if (m.includes('Invalid login credentials')) return '邮箱或密码不对。第一次来？点下面"首次使用"'
    if (m.includes('Signups not allowed')) return '系统暂未开放登录，请联系管理员'
    if (m.includes('User already registered')) return '这个邮箱已设过密码，直接登录即可'
    if (m.includes('rate limit') || m.includes('rate_limit')) return '操作太频繁，请等几分钟再试'
    if (m.includes('at least 6 characters')) return '密码至少 6 位'
    return m
  }

  async function signIn(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setErr(humanize(error.message))
  }

  // 被邀请的新用户：第一次来直接设密码（邮箱是否在邀请名单，由数据层校验）
  async function signUp() {
    setErr('')
    if (!email || !password) { setErr('填好邮箱和密码再点'); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) { setErr(humanize(error.message)); return }
    if (!data.session) setSent(true) // 后台若开着邮箱确认，则提示去点邮件
  }

  async function sendLink(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setErr(humanize(error.message))
    else setSent(true)
  }

  const inputCls = 'rounded-lg border border-stone-200 px-3.5 py-2.5 text-[15px] outline-none focus:border-stone-400'

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs text-center">
        <img src="/logo.png" alt="NowNow" className="mx-auto w-20 rounded-2xl md:w-16" />
        <h1 className="mt-3 text-xl font-bold">NowNow</h1>
        {loggedIn && (
          <p className="mt-2 text-xs text-stone-400">
            你已登录 ·{' '}
            <a href="/" className="text-blue-600 hover:underline">
              进入主页
            </a>
          </p>
        )}
        {invited && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
            你收到了 NowNow 的加入邀请——确认邮箱已被加进名单后，设置密码即可进入
          </p>
        )}

        {sent ? (
          <p className="mt-6 text-sm text-stone-600">
            邮件已发到 <b>{email}</b>，去邮箱点一下链接。
          </p>
        ) : mode === 'password' ? (
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-3">
            <input type="email" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <input type="password" required placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
            <button type="submit" disabled={busy} className="rounded-lg bg-stone-900 py-2.5 text-[15px] text-white hover:bg-stone-700 disabled:opacity-60">
              登录
            </button>
            <button type="button" onClick={signUp} disabled={busy} className="rounded-lg border border-stone-200 py-2.5 text-[15px] text-stone-700 hover:border-stone-400 disabled:opacity-60">
              首次使用？设置密码并进入
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="button" onClick={() => { setMode('link'); setErr('') }} className="text-xs text-stone-400 hover:text-stone-600">
              忘了密码？用邮件链接登录
            </button>
          </form>
        ) : (
          <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
            <input type="email" required placeholder="你的邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <button type="submit" disabled={busy} className="rounded-lg bg-stone-900 py-2.5 text-[15px] text-white hover:bg-stone-700 disabled:opacity-60">
              发送登录链接
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="button" onClick={() => { setMode('password'); setErr('') }} className="text-xs text-stone-400 hover:text-stone-600">
              ← 返回密码登录
            </button>
          </form>
        )}
      </div>
      <a
        href="https://github.com/Openhaitao"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-xs text-stone-300 hover:text-stone-500"
      >
        made by haitao
      </a>
    </div>
  )
}
