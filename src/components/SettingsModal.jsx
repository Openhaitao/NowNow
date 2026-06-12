import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, LogOut, UserPlus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

export default function SettingsModal({ open, onClose, me, email, allEntries, profiles = [], onProfileSaved }) {
  const [handle, setHandle] = useState(me.display_name || me.handle)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [allowed, setAllowed] = useState([])
  const [inviteMsg, setInviteMsg] = useState('')
  const [membersOpen, setMembersOpen] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwMsg, setPwMsg] = useState('')

  // 修改密码（密码本身是加密存的，没人能"查看"，只能改成新的）
  async function changePassword() {
    setPwMsg('')
    if (newPw.length < 6) { setPwMsg('密码至少 6 位'); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) setPwMsg(error.message)
    else { setPwMsg('密码已更新 ✓'); setNewPw(''); setTimeout(() => setPwMsg(''), 2000) }
  }
  const saveTimer = useRef(null)


  // 名字默认就存（和正文一个习惯，没有保存按钮）
  function handleNameChange(v) {
    setHandle(v)
    setErr('')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistName(v), 600)
  }

  async function persistName(v) {
    const clean = v.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) { setErr('名字不能为空或带空格'); return }
    if (clean === me.display_name) return
    const { error } = await supabase
      .from('profiles')
      .update({ handle: clean.toLowerCase(), display_name: clean })
      .eq('id', me.id)
    if (error) setErr(error.message)
    else {
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      onProfileSaved()
    }
  }

  // 邀请名单：读取 + 添加邮箱 + 移除
  useEffect(() => {
    supabase.from('allowed_emails').select('*').order('created_at').then(({ data }) => setAllowed(data || []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addEmail() {
    const em = inviteEmail.trim().toLowerCase()
    if (!em || !em.includes('@')) { setInviteMsg('填一个有效邮箱'); return }
    const { error } = await supabase.from('allowed_emails').insert({ email: em, invited_by: me.id })
    if (error) {
      setInviteMsg(error.message.includes('duplicate') ? '这个邮箱已经在名单里了' : error.message)
      return
    }
    setAllowed((a) => [...a, { email: em, invited_by: me.id }])
    setInviteEmail('')
    setInviteMsg(`已放行 ${em}——告诉对方打开 ${window.location.origin} 设置密码即可进入`)
  }

  async function removeEmail(em) {
    await supabase.from('allowed_emails').delete().eq('email', em)
    setAllowed((a) => a.filter((x) => x.email !== em))
  }

  // 数据导出：我的全部条目 → Markdown 下载（数据所有权，flomo 同款理念）
  function exportData() {
    const mine = allEntries.filter((e) => e.owner === me.id)
    const lines = [`# ${me.display_name} 的 NowNow 数据`, '']
    for (const sec of ['today', 'week', 'month']) {
      lines.push(`## ${SECTION_LABELS[sec]}`)
      for (const e of mine.filter((x) => x.section === sec).sort((a, b) => a.position - b.position)) {
        const box = e.is_goal ? (e.status === 'closed' ? '- [x] ' : '- [ ] ') : '- '
        const flags = [e.is_private ? '(私密)' : '', e.status === 'resolved' ? '(已解决待关闭)' : '', e.anchor || '']
          .filter(Boolean)
          .join(' ')
        lines.push(box + e.content + (flags ? `  _${flags}_` : ''))
      }
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nownow-${me.handle}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-semibold">设置</h2>

        {/* 个人信息 */}
        <div className="mt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-300">个人信息</div>
          <label className="mt-2 block text-xs text-stone-500">
            名字（显示用它，@你 也用它；改完自动保存）
            <span className="relative block">
              <input
                value={handle}
                onChange={(e) => handleNameChange(e.target.value)}
                onBlur={() => { clearTimeout(saveTimer.current); persistName(handle) }}
                className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[14px] text-stone-900 outline-none focus:border-stone-400"
              />
              {saved && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-emerald-600">已保存 ✓</span>
              )}
            </span>
          </label>
          <label className="mt-3 block text-xs text-stone-500">
            登录邮箱（暂不可更改）
            <input
              value={email}
              disabled
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[14px] text-stone-400 outline-none"
            />
          </label>
          <label className="mt-3 block text-xs text-stone-500">
            修改密码
            <span className="mt-1 flex gap-1.5">
              <input
                type="password"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setPwMsg('') }}
                onKeyDown={(e) => e.key === 'Enter' && changePassword()}
                placeholder="输入新密码（至少 6 位）"
                className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-2 text-[14px] text-stone-900 outline-none focus:border-stone-400"
              />
              <button
                onClick={changePassword}
                disabled={!newPw}
                className="shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-[13px] text-white hover:bg-stone-700 disabled:opacity-30"
              >
                更新
              </button>
            </span>
            {pwMsg && <span className={'mt-1 block text-xs ' + (pwMsg.includes('✓') ? 'text-emerald-600' : 'text-red-600')}>{pwMsg}</span>}
          </label>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>

        {/* 成员 */}
        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-300">成员</div>
          <div className="mt-2 flex gap-1.5">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteMsg('') }}
              onKeyDown={(e) => e.key === 'Enter' && addEmail()}
              placeholder="对方邮箱"
              className="min-w-0 flex-1 rounded-lg border border-stone-200 px-3 py-1.5 text-[13px] outline-none focus:border-stone-400"
            />
            <button
              onClick={addEmail}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[13px] text-white hover:bg-stone-700"
            >
              <UserPlus size={13} /> 邀请
            </button>
          </div>
          {inviteMsg && <p className="mt-1.5 text-xs text-blue-600">{inviteMsg}</p>}
          <p className="mt-1 text-[11px] text-stone-300">
            邀请 = 放行邮箱。对方打开 {window.location.origin} 用这个邮箱设置密码、起名即进
          </p>
          {(() => {
            const joined = profiles.filter((p) => p.status !== 'pending')
            const joinedEmails = new Set(joined.map((p) => (p.email || '').toLowerCase()))
            const waiting = allowed.filter((a) => !joinedEmails.has(a.email.toLowerCase()))
            const total = joined.length + waiting.length
            return (
              <div className="mt-2">
                <button
                  onClick={() => setMembersOpen((v) => !v)}
                  className="flex items-center gap-1 text-xs text-stone-400 outline-none hover:text-stone-600"
                >
                  {membersOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  成员与邀请名单（{total}）
                </button>
                {membersOpen && (
                  <div className="mt-1.5 space-y-1">
                    {joined.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs">
                        <span className="text-stone-700">
                          {p.display_name}
                          {p.id === me.id ? '（我）' : ''}
                        </span>
                        {p.email && <span className="text-stone-300">{p.email}</span>}
                      </div>
                    ))}
                    {waiting.map((a) => (
                      <div key={a.email} className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs">
                        <span className="text-amber-700">{a.email}</span>
                        <span className="text-amber-400">已邀请 · 未加入</span>
                        <button onClick={() => removeEmail(a.email)} title="移出名单" className="ml-auto text-stone-300 hover:text-red-500">
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* 数据与账号 */}
        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-300">数据与账号</div>
          <button onClick={exportData} className="mt-2 flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700">
            <Download size={13} /> 导出我的数据（Markdown）
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-2 flex items-center gap-1.5 text-[13px] text-red-500 hover:text-red-700"
          >
            <LogOut size={13} /> 退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
