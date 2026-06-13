import { useEffect, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './lib/supabase'

// 两态：注册（要邀请码）/ 登录（不要码）。新用户落注册页、回头客落登录页；带邀请链接一律注册页。
// 起名字在进门后的 SetupCard 完成；这里只管「拿到登录态」。
export default function Login() {
  const inviteFromLink = localStorage.getItem('nownow_invite') || ''
  const lastEmail = localStorage.getItem('nownow_last_email') || ''
  const lastName = localStorage.getItem('nownow_last_name') || ''

  const [authMode, setAuthMode] = useState(inviteFromLink || !lastEmail ? 'register' : 'login')
  const [recover, setRecover] = useState(false) // 忘了密码：邮件链接登录

  const [inviteCode, setInviteCode] = useState(inviteFromLink)
  const [email, setEmail] = useState(lastEmail)
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = (authMode === 'register' ? 'Sign up' : 'Login') + ' | NowNow'
  }, [authMode])

  function humanize(m) {
    if (!m) return '出错了，再试一次'
    if (m.includes('Invalid login credentials')) return '邮箱或密码不对。没有账号？点下面用邀请码注册'
    if (m.includes('Email not confirmed')) return '这个账号需要管理员在后台确认邮箱一次（Authentication → Users → 该用户 → Confirm email）'
    if (m.includes('Signups not allowed')) return '系统暂未开放注册，请联系管理员'
    if (m.includes('User already registered') || m.includes('already registered')) return '这个邮箱已经注册过了，直接去登录'
    if (m.includes('rate limit') || m.includes('rate_limit')) return '操作太频繁，请等几分钟再试'
    if (m.includes('at least 6 characters')) return '密码至少 6 位'
    return m
  }

  async function doRegister(e) {
    e.preventDefault()
    setErr('')
    if (!inviteCode.trim()) { setErr('请填写邀请码'); return }
    if (password !== password2) { setErr('两次输入的密码不一样'); return }
    setBusy(true)
    // 邀请码带进门，SetupCard 起名时后端 redeem_code 校验
    localStorage.setItem('nownow_invite_code', inviteCode.trim())
    const { data, error } = await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (error) {
      setErr(humanize(error.message))
      if (error.message.includes('already registered')) setAuthMode('login')
      return
    }
    // Supabase 防枚举：对已存在邮箱 signUp 也返回"成功"但 identities 为空——其实是老账号
    const existing = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
    if (existing) { setErr('这个邮箱已经注册过了，直接去登录'); setAuthMode('login'); return }
    localStorage.setItem('nownow_last_email', email)
    if (!data.session) setSent(true) // 兜底：后台若开着邮箱确认
    // 有 session：自动进 Board → SetupCard 起名 → redeem_code
  }

  async function doLogin(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setErr(humanize(error.message)); return }
    localStorage.setItem('nownow_last_email', email)
  }

  async function sendLink(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })
    setBusy(false)
    if (error) setErr(humanize(error.message))
    else setSent(true)
  }

  const inputCls =
    'rounded-md border border-stone-200 bg-[var(--surface-elevated)] px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
  const btnCls =
    'rounded-md bg-[var(--btn-bg)] py-2.5 text-[15px] text-[var(--btn-fg)] transition-all hover:-translate-y-px hover:bg-[var(--btn-bg-hover)] hover:shadow-md disabled:opacity-60'
  const linkCls = 'text-xs text-stone-400 hover:text-stone-600'

  const pwField = (placeholder, autoComplete) => (
    <span className="relative">
      <input
        type={showPw ? 'text' : 'password'}
        name="password"
        autoComplete={autoComplete}
        required
        placeholder={placeholder}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputCls + ' w-full pr-10'}
      />
      <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-300 outline-none hover:text-stone-500">
        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  )

  return (
    <div className="login-paper relative flex min-h-dvh flex-col items-center justify-center px-4 max-md:justify-start max-md:pt-[12vh]">
      <div className="float-in w-full max-w-sm rounded-lg border border-stone-200/80 bg-[var(--surface-elevated)] px-8 py-10 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <img src="/logo.png" alt="NowNow" className="mx-auto w-20" />
        <h1 className="mt-5 text-xl font-bold">
          {recover ? '邮件链接登录' : authMode === 'register' ? '注册 NowNow' : lastName ? `Hi @${lastName}` : '登录 NowNow'}
        </h1>

        {sent ? (
          <p className="mt-6 text-sm text-stone-600">
            邮件已发到 <b>{email}</b>，去邮箱点一下链接。
          </p>
        ) : recover ? (
          <form onSubmit={sendLink} className="mt-6 flex flex-col gap-3">
            <input type="email" required placeholder="你的邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            <button type="submit" disabled={busy} className={btnCls}>{busy ? '发送中…' : '发送登录链接'}</button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="button" onClick={() => { setRecover(false); setErr('') }} className={linkCls}>← 返回密码登录</button>
          </form>
        ) : authMode === 'register' ? (
          <form onSubmit={doRegister} className="mt-6 flex flex-col gap-3">
            <input required placeholder="邀请码" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className={inputCls} />
            <input type="email" name="email" autoComplete="username" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            {pwField('设置密码（至少 6 位）', 'new-password')}
            <input type={showPw ? 'text' : 'password'} required placeholder="再输一遍确认" value={password2} onChange={(e) => setPassword2(e.target.value)} className={inputCls} />
            <button type="submit" disabled={busy} className={btnCls}>{busy ? '注册中…' : '注册并进入'}</button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button type="button" onClick={() => { setAuthMode('login'); setErr('') }} className={linkCls}>已有账号？去登录</button>
          </form>
        ) : (
          <form onSubmit={doLogin} className="mt-6 flex flex-col gap-3">
            <input type="email" name="email" autoComplete="username" required placeholder="邮箱" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            {pwField('密码', 'current-password')}
            <button type="submit" disabled={busy} className={btnCls}>{busy ? '登录中…' : '登录'}</button>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex items-center justify-between">
              <button type="button" onClick={() => { setAuthMode('register'); setErr('') }} className={linkCls}>没有账号？用邀请码注册</button>
              <button type="button" onClick={() => { setRecover(true); setErr('') }} className={linkCls}>忘了密码？</button>
            </div>
          </form>
        )}
      </div>
      <a
        href="https://github.com/Openhaitao"
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-xs text-[var(--ink)]"
      >
        🧑🏻‍💻 made by haitao
      </a>
    </div>
  )
}
