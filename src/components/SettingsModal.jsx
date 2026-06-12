import { useState } from 'react'
import { Download, LogOut, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月' }

export default function SettingsModal({ open, onClose, me, email, allEntries, onProfileSaved }) {
  const [handle, setHandle] = useState(me.display_name || me.handle)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  // 生成一次性邀请链接并复制（对方点链接→输邮箱→起名即进）
  async function makeInvite() {
    const { data, error } = await supabase
      .from('invites')
      .insert({ created_by: me.id })
      .select()
      .single()
    if (error) { setErr('生成邀请失败：' + error.message); return }
    const link = `${window.location.origin}/?invite=${data.token}`
    setInviteLink(link)
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* 剪贴板被拒就让用户手动复制 */ }
  }

  if (!open) return null

  async function save() {
    setErr('')
    const clean = handle.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) { setErr('@名不能为空或带空格'); return }
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

  // 数据导出：我的全部条目 → Markdown 下载（数据所有权，flomo 同款理念）
  function exportData() {
    const mine = allEntries.filter((e) => e.owner === me.id)
    const lines = [`# ${me.display_name} 的 NowNow 数据`, '']
    for (const sec of ['today', 'week', 'month']) {
      lines.push(`## ${SECTION_LABELS[sec]}`)
      for (const e of mine.filter((x) => x.section === sec).sort((a, b) => a.position - b.position)) {
        const box = e.is_goal ? (e.status === 'closed' ? '- [x] ' : '- [ ] ') : '- '
        const flags = [e.is_private ? '🔒' : '', e.status === 'resolved' ? '(已解决待关闭)' : '', e.anchor || '']
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

        <label className="mt-4 block text-xs text-stone-500">
          名字（显示用它，@你 也用它）
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[14px] text-stone-900 outline-none focus:border-stone-400"
          />
        </label>
        <div className="mt-2 text-xs text-stone-400">登录邮箱：{email}</div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
        <button
          onClick={save}
          className="mt-3 w-full rounded-lg bg-stone-900 py-2 text-[14px] text-white hover:bg-stone-700"
        >
          {saved ? '已保存 ✓' : '保存'}
        </button>

        <div className="mt-5 border-t border-stone-100 pt-4">
          <button onClick={makeInvite} className="flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700">
            <UserPlus size={13} /> 生成邀请链接{copied ? '（已复制 ✓）' : ''}
          </button>
          {inviteLink && (
            <div className="mt-2 select-all break-all rounded-lg bg-stone-50 px-2.5 py-1.5 text-xs text-stone-500">
              {inviteLink}
            </div>
          )}
          <p className="mt-1 text-[11px] text-stone-300">一条链接进一个人；对方点开→输邮箱收登录链接→起名即加入</p>
        </div>
        <div className="mt-3">
          <button onClick={exportData} className="flex items-center gap-1.5 text-[13px] text-stone-500 hover:text-stone-700">
            <Download size={13} /> 导出我的数据（Markdown）
          </button>
        </div>
        <div className="mt-2">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-1.5 text-[13px] text-red-500 hover:text-red-700"
          >
            <LogOut size={13} /> 退出登录
          </button>
        </div>
      </div>
    </div>
  )
}
