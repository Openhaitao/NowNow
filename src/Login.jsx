import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './lib/supabase'

// 登录：邮箱+密码为主（无邮件往返、不吃邮件限额），邮件链接作备用/找回
export default function Login() {
  // 邀请链接 /login?email=xxx：预填邮箱 + 进入"设置密码"模式（带确认密码）
  const inviteEmail = new URLSearchParams(window.location.search).get('email') || ''
  // 登录过的邮箱记住，下次打开直接填好；密码交给浏览器钥匙串自动填
  const [email, setEmail] = useState(inviteEmail || localStorage.getItem('nownow_last_email') || '')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const onboarding = !!inviteEmail

  // 标签页标题：邀请进入 = Invite | NowNow，普通登录 = Login | NowNow
  useEffect(() => {
    document.title = onboarding ? 'Invite | NowNow' : 'Login | NowNow'
  }, [onboarding])
  const [mode, setMode] = useState('password') // password | link
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRecover, setShowRecover] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function humanize(m) {
    if (!m) return '出错了，再试一次'
    if (m.includes('Invalid login credentials')) return '邮箱或密码不对。第一次来？点下面"首次使用"'
    if (m.includes('Signups not allowed')) return '系统暂未开放登录，请联系管理员'
    if (m.includes('User already registered')) return '这个邮箱已设过密码，直接登录即可'
    if (m.includes('rate limit') || m.includes('rate_limit')) return '操作太频繁，请等几分钟再试'
    if (m.includes('at least 6 characters')) return '密码至少 6 位'
    return m
  }

  // 一个按钮搞定新老用户：先试登录，账号不存在就自动注册（首次输入的密码即账号密码）
  async function signIn(e) {
    e.preventDefault()
    setErr('')
    if (onboarding && password !== password2) {
      setErr('两次输入的密码不一样')
      return
    }
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      localStorage.setItem('nownow_last_email', email)
      setBusy(false)
      return
    }
    const known = JSON.parse(localStorage.getItem('nownow_known_emails') || '[]')
    if (error.message.includes('Invalid login credentials') && !known.includes(email)) {
      const { data, error: e2 } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (!e2) {
        localStorage.setItem('nownow_last_email', email)
        if (!data.session) setSent(true) // 后台若开着邮箱确认的兜底
        return
      }
      // 注册说"已存在" = 老账号密码输错了；记住这个邮箱，以后输错密码不再空打注册请求（防触发频率限制）
      if (e2.message.includes('already registered')) {
        localStorage.setItem('nownow_known_emails', JSON.stringify([...known, email]))
        setErr('密码不对。忘了的话用下面的邮件链接找回')
      }
      else setErr(humanize(e2.message))
      setShowRecover(true)
      return
    }
    setBusy(false)
    setErr(humanize(error.message))
    setShowRecover(true)
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
        <img src="/logo.png" alt="NowNow" className="mx-auto w-20 md:w-16" />
        <h1 className="mt-3 text-xl font-bold">NowNow</h1>

        {sent ? (
          <p className="mt-6 text-sm text-stone-600">
            邮件已发到 <b>{email}</b>，去邮箱点一下链接。
          </p>
        ) : mode === 'password' ? (
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-3">
            <input type="email" name="email" autoComplete="username" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <span className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                name="password"
                autoComplete={onboarding ? 'new-password' : 'current-password'}
                required
                placeholder={onboarding ? '设置密码（至少 6 位）' : '密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls + ' w-full pr-10'}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 outline-none hover:text-stone-500"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
            {onboarding && (
              <input
                type={showPw ? 'text' : 'password'}
                required
                placeholder="再输一遍确认"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className={inputCls}
              />
            )}
            <button type="submit" disabled={busy} className="rounded-lg bg-stone-900 py-2.5 text-[15px] text-white hover:bg-stone-700 disabled:opacity-60">
              {busy ? '登录中…' : onboarding ? '设置密码并进入' : '登录'}
            </button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            {showRecover && (
              <button type="button" onClick={() => { setMode('link'); setErr('') }} className="text-xs text-stone-400 hover:text-stone-600">
                忘了密码？用邮件链接登录
              </button>
            )}
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
        🧑🏻‍💻 made by haitao
      </a>
    </div>
  )
}
