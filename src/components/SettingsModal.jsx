import { useRef, useState } from 'react'
import { Download, Loader2, LogOut, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

export default function SettingsModal({ open, onClose, me, email, allEntries, onProfileSaved }) {
  const [handle, setHandle] = useState(me.display_name || me.handle)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const saveTimer = useRef(null)

  if (!open) return null

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

  // 生成一次性邀请链接：立即给反馈，成功自动复制
  async function makeInvite() {
    setInviteLoading(true)
    setErr('')
    const { data, error } = await supabase
      .from('invites')
      .insert({ created_by: me.id })
      .select()
      .single()
    setInviteLoading(false)
    if (error) { setErr('生成邀请失败：' + error.message); return }
    const link = `${window.location.origin}/?invite=${data.token}`
    setInviteLink(link)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch { /* 剪贴板被拒就让用户手动复制 */ }
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
          <div className="mt-2 text-xs text-stone-400">登录邮箱：{email}（登录靠邮件链接，无密码可丢）</div>
          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        </div>

        {/* 成员 */}
        <div className="mt-5 border-t border-stone-100 pt-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-stone-300">成员</div>
          <button
            onClick={makeInvite}
            disabled={inviteLoading}
            className="mt-2 flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700 disabled:opacity-60"
          >
            {inviteLoading ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
            {inviteLoading ? '生成中…' : '生成邀请链接'}
          </button>
          {inviteLink && (
            <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2">
              <div className="flex items-center justify-between text-[11px] text-blue-600">
                <span>把这条链接发给要邀请的人</span>
                {copied && <span className="font-medium">已复制到剪贴板 ✓</span>}
              </div>
              <div className="mt-1 select-all break-all text-xs text-blue-900">{inviteLink}</div>
            </div>
          )}
          <p className="mt-1 text-[11px] text-stone-300">一条链接进一个人；对方点开→输邮箱收登录链接→起名即加入</p>
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
