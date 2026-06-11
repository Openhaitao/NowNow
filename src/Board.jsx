import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import Inbox from './components/Inbox'
import Section from './components/Section'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

const LAST_VIEWED_KEY = 'nownow_last_viewed'
const loadLastViewed = () => JSON.parse(localStorage.getItem(LAST_VIEWED_KEY) || '{}')

// 首次进入：在主页面中央起名，不单独占一页
function SetupCard({ user, onDone }) {
  const [handle, setHandle] = useState(user.email.split('@')[0].replace(/\W/g, ''))
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState('')

  async function save(e) {
    e.preventDefault()
    setErr('')
    const clean = handle.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) { setErr('@名不能为空或带空格'); return }
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      handle: clean.toLowerCase(),
      display_name: displayName.trim() || clean,
    })
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={save} className="w-full max-w-xs rounded-2xl border border-stone-200 bg-white p-7">
        <h2 className="text-lg font-semibold">第一次来，起个名字</h2>
        <label className="mt-4 block text-xs text-stone-500">
          @名（别人这样喊你，中文/英文都行，如 海涛）
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[15px] text-stone-900 outline-none focus:border-stone-400"
          />
        </label>
        <label className="mt-3 block text-xs text-stone-500">
          显示名（可选）
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="比如：海涛"
            className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-[15px] text-stone-900 outline-none focus:border-stone-400"
          />
        </label>
        <button type="submit" className="mt-5 w-full rounded-lg bg-stone-900 py-2.5 text-[15px] text-white hover:bg-stone-700">
          进入
        </button>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </form>
    </div>
  )
}

export default function Board({ session }) {
  const user = session.user
  const [profiles, setProfiles] = useState([])
  const [needSetup, setNeedSetup] = useState(false)
  const [pageUserId, setPageUserId] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [mentions, setMentions] = useState([])
  const [lastViewed, setLastViewed] = useState(loadLastViewed)

  const me = profiles.find((p) => p.id === user.id) || null

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('handle')
    setProfiles(data || [])
    setNeedSetup(!(data || []).some((p) => p.id === user.id))
  }, [user.id])

  const loadData = useCallback(async () => {
    const [{ data: es }, { data: ms }] = await Promise.all([
      supabase.from('entries').select('*'),
      supabase
        .from('mentions')
        .select('*, entries!mentions_entry_id_fkey(content, creator)')
        .eq('mentioned', user.id)
        .is('claimed_entry', null),
    ])
    setAllEntries(es || [])
    setMentions(ms || [])
  }, [user.id])

  useEffect(() => { loadProfiles() }, [loadProfiles])
  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { if (me && !pageUserId) setPageUserId(me.id) }, [me, pageUserId])

  // Realtime：库一变就重拉（两三个人的量级，重拉最简单可靠）
  useEffect(() => {
    const ch = supabase
      .channel('nownow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mentions' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadData])

  // 切到某人页面 = 记录"看过的时间"，红点据此熄灭
  const viewPage = useCallback((pid) => {
    setPageUserId(pid)
    const next = { ...loadLastViewed(), [pid]: new Date().toISOString() }
    localStorage.setItem(LAST_VIEWED_KEY, JSON.stringify(next))
    setLastViewed(next)
  }, [])

  const hasNews = useCallback(
    (p) => {
      if (!me || p.id === me.id || p.id === pageUserId) return false
      const seen = lastViewed[p.id] || '1970-01-01'
      return allEntries.some((e) => e.owner === p.id && !e.is_private && e.updated_at > seen)
    },
    [me, pageUserId, lastViewed, allEntries],
  )

  const pageEntries = useMemo(
    () => allEntries.filter((e) => e.owner === pageUserId),
    [allEntries, pageUserId],
  )

  useEffect(() => {
    if (me) document.title = `${me.display_name} | NowNow`
  }, [me])

  if (needSetup) return <SetupCard user={user} onDone={loadProfiles} />
  if (!me) return null

  const pageUser = profiles.find((p) => p.id === pageUserId) || me
  const isMyPage = pageUser.id === me.id

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl">
      {/* 左栏：人员列表（桌面，flomo 式贴近内容） */}
      <aside className="hidden w-40 shrink-0 flex-col px-2 py-5 md:flex">
        <div className="mb-4 flex items-center gap-1.5 px-2.5 text-[13px] font-semibold">
          <img src="/logo.png" alt="" className="h-5 w-5 rounded" />
          <span className="truncate">{me.display_name} | NowNow</span>
        </div>
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => viewPage(p.id)}
            className={
              'flex items-center rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ' +
              (p.id === pageUserId ? 'bg-blue-50 font-medium text-blue-700' : 'text-stone-600 hover:bg-stone-100')
            }
          >
            <span className="truncate">
              {p.display_name}
              {p.id === me.id ? '（我）' : ''}
            </span>
            {hasNews(p) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500" title="有新动态" />}
          </button>
        ))}
        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-auto px-2.5 py-1 text-left text-xs text-stone-300 hover:text-stone-500"
        >
          退出登录
        </button>
      </aside>

      {/* 主区 */}
      <main className="min-w-0 flex-1">
        {/* 移动端：顶部人名横排 */}
        <div className="flex items-center gap-1.5 border-b border-stone-100 px-4 py-2.5 md:hidden">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => viewPage(p.id)}
                className={
                  'relative shrink-0 rounded-full px-2.5 py-0.5 text-[13px] ' +
                  (p.id === pageUserId ? 'bg-blue-50 font-medium text-blue-700' : 'text-stone-500')
                }
              >
                {p.display_name}
                {hasNews(p) && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />}
              </button>
            ))}
          </div>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-400">
            退出
          </button>
        </div>

        <div className="max-w-xl px-5 pb-24 pt-2 md:px-6">
          {!isMyPage && (
            <div className="mt-4 text-[13px] text-stone-400">{pageUser.display_name} 的纸（只读）</div>
          )}
          {isMyPage && <Inbox mentions={mentions} profiles={profiles} onChanged={loadData} />}
          {SECTIONS.map((sec) => (
            <Section
              key={sec.key}
              sec={sec}
              entries={pageEntries}
              me={me}
              isMyPage={isMyPage}
              profiles={profiles}
              allEntries={allEntries}
              onChanged={loadData}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
