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
  const [name, setName] = useState('')
  const onboarding = !!inviteEmail
  // 老用户回来：标题直接打招呼（名字在进主页时记下的）
  const lastName = localStorage.getItem('nownow_last_name') || ''

  // 标签页标题：邀请进入 = Invite | NowNow，普通登录 = Login | NowNow
  useEffect(() => {
    document.title = onboarding ? 'Invite | NowNow' : 'Login | NowNow'
  }, [onboarding])
  // 固定邀请码：注册大门（后端 redeem_code 校验，前端只收集）。邀请链接 ?invite= 自动填好（App 存进 nownow_invite）
  const [inviteCode, setInviteCode] = useState(localStorage.getItem('nownow_invite') || '')
  const [mode, setMode] = useState('password') // password | link
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [showRecover, setShowRecover] = useState(false)
  const [showPw, setShowPw] = useState(false)

  function humanize(m) {
    if (!m) return '出错了，再试一次'
    if (m.includes('Invalid login credentials')) return '邮箱或密码不对。第一次来？点下面"首次使用"'
    if (m.includes('Email not confirmed')) return '这个账号注册时邮箱确认还开着，需要管理员在后台确认一次（Authentication → Users → 该用户 → Confirm email）'
    if (m.includes('Signups not allowed')) return '系统暂未开放登录，请联系管理员'
    if (m.includes('User already registered')) return '这个邮箱已设过密码，直接登录即可'
    if (m.includes('rate limit') || m.includes('rate_limit')) return '操作太频繁，请等几分钟再试'
    if (m.includes('at least 6 characters')) return '密码至少 6 位'
    return m
  }

  // 重名预检：在邀请页就拦下，不让用户进门后才发现（函数还没建时跳过，靠进门后的兜底报错）
  async function nameTaken(n) {
    try {
      const { data, error } = await supabase.rpc('handle_taken', { p_name: n })
      return error ? false : !!data
    } catch {
      return false
    }
  }

  // 一个按钮搞定新老用户：先试登录，账号不存在就自动注册（首次输入的密码即账号密码）
  async function signIn(e) {
    e.preventDefault()
    try {
      await doSignIn()
    } catch (ex) {
      setBusy(false)
      setErr('出错了：' + String(ex?.message || ex))
    }
  }

  async function doSignIn() {
    setErr('')
    // 邀请码带进主页：起名/认领时后端用 redeem_code 校验
    localStorage.setItem('nownow_invite_code', inviteCode.trim())
    if (onboarding) {
      const n = name.trim().replace(/^@/, '')
      if (!n) { setErr('先在上面填上你的名字'); return }
      if (/\s/.test(n)) { setErr('名字不能带空格'); return }
      if (password !== password2) { setErr('两次输入的密码不一样'); return }
      setBusy(true)
      if (await nameTaken(n)) {
        setBusy(false)
        setErr(`@${n} 已经有人用了，换一个名字`)
        return
      }
      // 名字带进主页：起名这步在邀请页就完成了，进去自动认领
      localStorage.setItem('nownow_pending_name', n)
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
        // Supabase 防枚举：对已存在的邮箱 signUp 也返回"成功"但 identities 为空——这是老账号，不是新注册
        const existing = data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0
        if (existing) {
          localStorage.setItem('nownow_known_emails', JSON.stringify([...known, email]))
          setErr('密码不对，或者这个账号还没设过密码（早期用邮件链接进来的）——用下面的邮件链接登录一次，进去后在 设置→修改密码 里设一个')
          setShowRecover(true)
          return
        }
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

  const inputCls =
    'rounded-md border border-stone-200 bg-[var(--surface-elevated)] px-3.5 py-2.5 text-[15px] outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

  return (
    <div className="login-paper relative flex min-h-dvh flex-col items-center justify-center px-4 max-md:justify-start max-md:pt-[12vh]">
      <div className="float-in w-full max-w-sm rounded-lg border border-stone-200/80 bg-[var(--surface-elevated)] px-8 py-10 text-center shadow-[0_8px_40px_rgba(0,0,0,0.06)]">
        <img src="/logo.png" alt="NowNow" className="mx-auto w-20" />
        {onboarding ? (
          <h1 className="mt-5 flex items-baseline justify-center text-xl font-bold">
            Hi&nbsp;@
            {/* 固定宽度的"名字槽"：Hi @ 打字时纹丝不动；下划线跟字等长（留一点保底），整体略向右偏 */}
            <span className="ml-2 w-20 text-left">
              <span className="relative inline-block min-w-[3.25rem]">
                <span aria-hidden="true" className="invisible whitespace-pre px-0.5">
                  {name || '名字'}
                </span>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErr('') }}
                  onBlur={async () => {
                    const n = name.trim().replace(/^@/, '')
                    if (n && (await nameTaken(n))) setErr(`@${n} 已经有人用了，换一个名字`)
                  }}
                  placeholder="名字"
                  className="absolute inset-0 w-full border-b-2 border-stone-200 bg-transparent px-0.5 text-left text-xl font-bold text-stone-900 outline-none transition-colors focus:border-stone-400 placeholder:text-base placeholder:font-normal placeholder:text-stone-300"
                />
              </span>
            </span>
          </h1>
        ) : (
          <h1 className="mt-5 text-xl font-bold">{lastName ? `Hi @${lastName}` : 'NowNow'}</h1>
        )}

        {sent ? (
          <p className="mt-6 text-sm text-stone-600">
            邮件已发到 <b>{email}</b>，去邮箱点一下链接。
          </p>
        ) : mode === 'password' ? (
          <form onSubmit={signIn} className="mt-6 flex flex-col gap-3">
            <input required placeholder="邀请码" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className={inputCls} />
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
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--btn-bg)] py-2.5 text-[15px] text-[var(--btn-fg)] transition-all hover:-translate-y-px hover:bg-[var(--btn-bg-hover)] hover:shadow-md disabled:opacity-60"
            >
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
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--btn-bg)] py-2.5 text-[15px] text-[var(--btn-fg)] transition-all hover:-translate-y-px hover:bg-[var(--btn-bg-hover)] hover:shadow-md disabled:opacity-60"
            >
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
        className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] text-xs text-[var(--ink)]"
      >
        🧑🏻‍💻 made by haitao
      </a>
    </div>
  )
}
