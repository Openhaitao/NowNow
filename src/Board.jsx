import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, LayoutList, Search, Settings } from 'lucide-react'
import { supabase } from './lib/supabase'
import { inPeriod, periodRange } from './lib/period'
import Inbox from './components/Inbox'
import NotificationsPage from './components/NotificationsPage'
import QuickCapture from './components/QuickCapture'
import SearchModal from './components/SearchModal'
import Section from './components/Section'
import SettingsModal from './components/SettingsModal'

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
  const [hasAnchor, setHasAnchor] = useState(false)

  const me = profiles.find((p) => p.id === user.id) || null

  // 探测时间锚定列是否已迁移（migration-001 跑过后自动启用日历导航）
  useEffect(() => {
    supabase
      .from('entries')
      .select('anchor')
      .limit(1)
      .then(({ error }) => setHasAnchor(!error))
  }, [])

  const [searchOpen, setSearchOpen] = useState(false)

  // 快捷键：/ 聚焦捕捉框；⌘K / Ctrl+K 搜索（mac/win 通吃）
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen((v) => !v)
        return
      }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault()
        document.getElementById('quick-capture')?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

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

  // 乐观更新（flomo 式先本地后同步）：UI 立即生效，服务端后台跑，完成后与库对齐
  const mutateEntries = useCallback(
    (transform, op) => {
      setAllEntries(transform)
      Promise.resolve()
        .then(op)
        .catch(() => {})
        .finally(() => loadData())
    },
    [loadData],
  )

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
    setView('paper')
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

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState('paper') // paper | notifications

  // 通知内容 = 待认领的@ + 我派出去已解决等我关闭的
  const resolvedMine = useMemo(
    () => (me ? allEntries.filter((e) => e.creator === me.id && e.status === 'resolved') : []),
    [me, allEntries],
  )
  const notifCount = mentions.length + resolvedMine.length

  // flomo 式三格：今日 / 本周 / 本月 当前周期的未完成目标数
  const stats = useMemo(() => {
    if (!me) return { today: 0, week: 0, month: 0 }
    const mine = allEntries.filter((e) => e.owner === me.id && e.is_goal && e.status !== 'closed')
    const count = (key) => {
      const range = periodRange(key, 0)
      return mine.filter((e) => e.section === key && inPeriod(e.anchor ?? null, range)).length
    }
    return { today: count('today'), week: count('week'), month: count('month') }
  }, [me, allEntries])

  if (needSetup) return <SetupCard user={user} onDone={loadProfiles} />
  if (!me) return null

  const pageUser = profiles.find((p) => p.id === pageUserId) || me
  const isMyPage = pageUser.id === me.id

  return (
    <div className="mx-auto flex h-screen max-w-3xl overflow-hidden">
      {/* 左栏：人员列表（固定不随内容滚动） */}
      <aside className="hidden h-full w-44 shrink-0 flex-col overflow-y-auto px-2 py-5 md:flex">
        {/* 顶部：当前用户 */}
        <div className="flex items-center gap-2 px-2.5 text-[15px] font-semibold">
          <img src="/logo.png" alt="" className="h-6 w-6 rounded" />
          <span className="truncate">{me.display_name}</span>
        </div>
        {/* flomo 式三格统计：各周期未完成目标数 */}
        <div className="mb-4 mt-4 grid grid-cols-3 gap-1 px-2.5 text-center" title="未完成的目标数">
          {[
            ['today', '今日'],
            ['week', '本周'],
            ['month', '本月'],
          ].map(([k, label]) => (
            <div key={k}>
              <div className="text-[22px] font-bold leading-tight">{stats[k]}</div>
              <div className="mt-0.5 text-[11px] text-stone-400">{label}</div>
            </div>
          ))}
        </div>
        {/* flomo 式「全部目标」：无视周期看全量 */}
        <button
          onClick={() => setView(view === 'all' ? 'paper' : 'all')}
          className={
            'mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ' +
            (view === 'all' ? 'bg-emerald-50 font-medium text-emerald-700' : 'text-stone-600 hover:bg-stone-100')
          }
        >
          <LayoutList size={14} /> 全部目标
        </button>
        {profiles.map((p) => (
          <button
            key={p.id}
            onClick={() => viewPage(p.id)}
            className={
              'flex items-center rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ' +
              (p.id === pageUserId && view === 'paper' ? 'bg-blue-50 font-medium text-blue-700' : 'text-stone-600 hover:bg-stone-100')
            }
          >
            <span className="truncate">
              {p.display_name}
              {p.id === me.id ? '（我）' : ''}
            </span>
            {hasNews(p) && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500" title="有新动态" />}
          </button>
        ))}
        {/* 底部：通知（完整页面）+ 设置 */}
        <div className="mt-auto">
          <button
            onClick={() => setView(view === 'notifications' ? 'paper' : 'notifications')}
            className={
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100 ' +
              (view === 'notifications' ? 'bg-blue-50 font-medium text-blue-700' : 'text-stone-500')
            }
          >
            <Bell size={14} /> 通知
            {notifCount > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">
                {notifCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-stone-500 hover:bg-stone-100"
          >
            <Settings size={14} /> 设置
          </button>
        </div>
      </aside>

      {/* 主区：输入框固定，纸内部滚动 */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        {/* 移动端：顶部人名横排 */}
        <div className="flex shrink-0 items-center gap-1.5 border-b border-stone-100 px-4 py-2.5 md:hidden">
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
          <button onClick={() => setSearchOpen(true)} className="text-stone-400">
            <Search size={16} />
          </button>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-400">
            退出
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 md:px-6">
        <div className="shrink-0 pt-3">
          {/* flomo 式顶部搜索条（右侧，点开 ⌘K 弹窗） */}
          <div className="hidden justify-end md:flex">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex w-44 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[12.5px] text-stone-300 hover:border-stone-300"
            >
              <Search size={13} />
              搜索
              <kbd className="ml-auto text-[10px]">⌘K</kbd>
            </button>
          </div>
          {view !== 'notifications' && !isMyPage && (
            <div className="mt-2 text-[13px] text-stone-400">
              {pageUser.display_name} 的纸（只读）{view === 'all' ? ' · 全部' : ''}
            </div>
          )}
          {view !== 'notifications' && isMyPage && (
            <QuickCapture me={me} profiles={profiles} allEntries={allEntries} hasAnchor={hasAnchor} mutate={mutateEntries} />
          )}
        </div>
        <div className="paper-scroll flex-1 overflow-y-auto pb-24 pr-1">
          {view === 'notifications' ? (
            <NotificationsPage
              mentions={mentions}
              resolvedMine={resolvedMine}
              profiles={profiles}
              onChanged={loadData}
              mutate={mutateEntries}
              onBack={() => viewPage(me.id)}
            />
          ) : (
            <>
              {isMyPage && view === 'paper' && <Inbox mentions={mentions} profiles={profiles} onChanged={loadData} />}
              {SECTIONS.map((sec) => (
                <Section
                  key={sec.key}
                  sec={sec}
                  entries={pageEntries}
                  me={me}
                  isMyPage={isMyPage}
                  profiles={profiles}
                  allEntries={allEntries}
                  hasAnchor={hasAnchor}
                  allTime={view === 'all'}
                  mutate={mutateEntries}
                />
              ))}
            </>
          )}
        </div>
        </div>
      </main>
      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        allEntries={allEntries}
        profiles={profiles}
        onJump={(e) => viewPage(e.owner)}
      />
      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          me={me}
          email={user.email}
          allEntries={allEntries}
          onProfileSaved={loadProfiles}
        />
      )}
    </div>
  )
}
