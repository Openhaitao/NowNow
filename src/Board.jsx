import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, CalendarDays, LayoutList, Loader2, Search, Settings } from 'lucide-react'
import { supabase } from './lib/supabase'
import { inPeriod, periodRange } from './lib/period'
import { DATE_TOKEN_RE, dateTokenState } from './lib/dates'
import DatePicker from './components/DatePicker'
import Inbox from './components/Inbox'
import NotificationsPage from './components/NotificationsPage'
import QuickCapture from './components/QuickCapture'
import Section from './components/Section'
import SettingsModal from './components/SettingsModal'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

const LAST_VIEWED_KEY = 'nownow_last_viewed'
const loadLastViewed = () => JSON.parse(localStorage.getItem(LAST_VIEWED_KEY) || '{}')

// 首次进入：凭邀请链接起名进入（没有邀请 = 进不来）
function SetupCard({ user, onDone }) {
  const [handle, setHandle] = useState(user.email.split('@')[0].replace(/\W/g, ''))
  const [err, setErr] = useState('')
  const invite = localStorage.getItem('nownow_invite')

  async function save(e) {
    e.preventDefault()
    setErr('')
    const clean = handle.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) { setErr('名字不能为空或带空格'); return }
    if (invite) {
      const { error } = await supabase.rpc('redeem_invite', { p_token: invite, p_name: clean })
      if (error) { setErr(error.message); return }
      localStorage.removeItem('nownow_invite')
      onDone()
      return
    }
    // 兼容旧库（没跑 migration-002 时仍走直插）
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      handle: clean.toLowerCase(),
      display_name: clean,
    })
    if (error) setErr('需要邀请链接才能加入，找已在系统里的同事生成一个')
    else onDone()
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={save} className="w-full max-w-xs rounded-xl border border-stone-200 bg-white p-7">
        <h2 className="text-lg font-semibold">第一次来，起个名字</h2>
        <label className="mt-4 block text-xs text-stone-500">
          名字（显示用它，@你 也用它；中英文都行，如 海涛）
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
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
  const activeProfiles = useMemo(
    () => profiles.filter((p) => p.status !== 'pending'),
    [profiles],
  )
  const [myInviteTokens, setMyInviteTokens] = useState([])

  // 探测时间锚定列是否已迁移（migration-001 跑过后自动启用日历导航）
  useEffect(() => {
    supabase
      .from('entries')
      .select('anchor')
      .limit(1)
      .then(({ error }) => setHasAnchor(!error))
  }, [])

  const [query, setQuery] = useState('') // 顶部搜索：直接输入、就地过滤 todolist
  const [baseDate, setBaseDate] = useState(null) // null = 真实今天；设了 = 整张纸拨回那天
  const [dateOpen, setDateOpen] = useState(false)
  const [flashId, setFlashId] = useState(null) // 搜索跳转后高亮定位的条目
  const [editRequest, setEditRequest] = useState(null) // 跨区接力：让某个区的第一条进入编辑
  const isLive = !baseDate

  // ⌘Z 撤销栈：完成/关闭/删除 这类非文字操作（文字编辑用 textarea 原生撤销）
  const undoStack = useRef([])
  const pushUndo = useCallback((item) => {
    undoStack.current.push(item)
    if (undoStack.current.length > 50) undoStack.current.shift()
  }, [])

  const loadProfiles = useCallback(async () => {
    const [{ data }, { data: inv }] = await Promise.all([
      supabase.from('profiles').select('*').order('handle'),
      supabase.from('invites').select('token').eq('created_by', user.id),
    ])
    setProfiles(data || [])
    setMyInviteTokens((inv || []).map((i) => i.token))
    setNeedSetup(!(data || []).some((p) => p.id === user.id))
  }, [user.id])

  const [loaded, setLoaded] = useState(false)

  // 拉取与应用分离：应用前还要验"拉的期间有没有新写操作"
  const fetchAll = useCallback(async () => {
    const [{ data: es }, { data: ms }] = await Promise.all([
      supabase.from('entries').select('*'),
      supabase
        .from('mentions')
        .select('*, entries!mentions_entry_id_fkey(content, creator)')
        .eq('mentioned', user.id)
        .is('claimed_entry', null),
    ])
    return { es: es || [], ms: ms || [] }
  }, [user.id])

  const applyLoad = useCallback(
    ({ es, ms }) => {
      // 自愈：清掉空内容的孤儿条目（正常路径建不出空条，出现=历史 bug 残留）
      const strays = es.filter((e) => e.owner === user.id && !e.content.trim())
      for (const stray of strays) supabase.from('entries').delete().eq('id', stray.id)
      setAllEntries(es.filter((e) => !strays.includes(e)))
      setMentions(ms)
      setLoaded(true)
    },
    [user.id],
  )

  const doLoad = useCallback(async () => applyLoad(await fetchAll()), [fetchAll, applyLoad])

  // 本地优先：还有写操作在路上时绝不刷新（刷早了会把刚删/刚改的内容"复活"）
  // mutEpoch：请求发出后若又有新写操作，这次拉回的快照就是旧的，整个丢弃重拉
  const pendingOps = useRef(0)
  const mutEpoch = useRef(0)
  const [syncing, setSyncing] = useState(false)
  const loadTimer = useRef(null)
  const loadData = useCallback(() => {
    clearTimeout(loadTimer.current)
    loadTimer.current = setTimeout(async () => {
      if (pendingOps.current > 0) {
        loadData() // 写操作没落完，再等一拍
        return
      }
      const epoch = mutEpoch.current
      const fresh = await fetchAll()
      if (mutEpoch.current !== epoch || pendingOps.current > 0) {
        loadData() // 拉的过程中又有新操作，这份快照作废
        return
      }
      applyLoad(fresh)
    }, 400)
  }, [fetchAll, applyLoad])

  // 乐观更新（flomo 式先本地后同步）：UI 立即生效，服务端后台跑，全部落完才与库对齐
  const mutateEntries = useCallback(
    (transform, op) => {
      mutEpoch.current++
      setAllEntries(transform)
      pendingOps.current++
      setSyncing(true)
      Promise.resolve()
        .then(op)
        .catch(() => {})
        .finally(() => {
          pendingOps.current--
          if (pendingOps.current === 0) setSyncing(false)
          loadData()
        })
    },
    [loadData],
  )

  // 只在"有问题"时提示：离线 / 同步卡了超过 2.5 秒（顺畅时完全安静）
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const [syncSlow, setSyncSlow] = useState(false)
  useEffect(() => {
    if (!syncing) { setSyncSlow(false); return }
    const t = setTimeout(() => setSyncSlow(true), 2500)
    return () => clearTimeout(t)
  }, [syncing])

  // 同步没落完时阻止关页/刷新（flomo 的"未同步会丢"防护）
  useEffect(() => {
    const h = (e) => {
      if (pendingOps.current > 0) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [])

  // 快捷键：/ 聚焦捕捉框；⌘K 搜索；⌘Z 撤销完成/删除（mac/win 通吃）
  useEffect(() => {
    const h = (e) => {
      const inText = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        document.getElementById('search-input')?.focus()
        return
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && !inText) {
        const it = undoStack.current.pop()
        if (!it) return
        e.preventDefault()
        if (it.type === 'status') {
          mutateEntries(
            (list) => list.map((x) => (x.id === it.id ? { ...x, status: it.prev } : x)),
            () => supabase.from('entries').update({ status: it.prev }).eq('id', it.id),
          )
        } else if (it.type === 'delete') {
          const r = it.row
          const row = {
            id: r.id, owner: r.owner, creator: r.creator, section: r.section,
            content: r.content, is_goal: r.is_goal, status: r.status,
            is_private: r.is_private, source_entry: r.source_entry, position: r.position,
          }
          if (hasAnchor && r.anchor) row.anchor = r.anchor
          mutateEntries((list) => [...list, r], () => supabase.from('entries').insert(row))
        }
        return
      }
      if (e.key === '/' && !inText) {
        e.preventDefault()
        document.getElementById('quick-capture')?.focus()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [mutateEntries, hasAnchor])

  useEffect(() => { loadProfiles() }, [loadProfiles])
  useEffect(() => { doLoad() }, [doLoad])
  useEffect(() => { if (me && !pageUserId) setPageUserId(me.id) }, [me, pageUserId])

  // Realtime：库一变就重拉（两三个人的量级，重拉最简单可靠）
  useEffect(() => {
    const ch = supabase
      .channel('nownow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mentions' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadProfiles)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadData, loadProfiles])

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

  // 桌面端打开即可打字（手机不自动弹键盘）
  useEffect(() => {
    if (loaded && me && window.innerWidth >= 768) {
      document.getElementById('quick-capture')?.focus()
    }
  }, [loaded, me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [view, setView] = useState('paper') // paper | notifications

  // 通知内容 = 待认领的@ + 我派出去已解决等我关闭的
  const resolvedMine = useMemo(
    () => (me ? allEntries.filter((e) => e.creator === me.id && e.status === 'resolved') : []),
    [me, allEntries],
  )
  // 到期提醒：我的未完成目标里，日期 token = 今天或已过期的
  const dueMine = useMemo(() => {
    if (!me) return []
    return allEntries.filter((e) => {
      if (e.owner !== me.id || !e.is_goal || e.status !== 'open') return false
      const tokens = e.content.match(DATE_TOKEN_RE) || []
      return tokens.some((t) => ['today', 'overdue'].includes(dateTokenState(t)))
    })
  }, [me, allEntries])

  const pendingMembers = useMemo(
    () => profiles.filter((p) => p.status === 'pending' && myInviteTokens.includes(p.invited_with)),
    [profiles, myInviteTokens],
  )

  const notifCount = mentions.length + resolvedMine.length + dueMine.length + pendingMembers.length

  // 三格：今日未完成 / 本周未完成（今天还要干啥）+ 累计已完成（成就感，flomo 的"863 笔记"对应物）
  const stats = useMemo(() => {
    if (!me) return { today: 0, week: 0, done: 0 }
    const mineGoals = allEntries.filter((e) => e.owner === me.id && e.is_goal)
    const open = mineGoals.filter((e) => e.status !== 'closed')
    const count = (key) => {
      const range = periodRange(key, 0)
      return open.filter((e) => e.section === key && inPeriod(e.anchor ?? null, range)).length
    }
    return {
      today: count('today'),
      week: count('week'),
      done: mineGoals.filter((e) => e.status === 'closed').length,
    }
  }, [me, allEntries])

  // 搜索跳转：纸拨回那条所在的日期 + 高亮闪烁定位
  const jumpToEntry = useCallback(
    (e) => {
      viewPage(e.owner)
      if (e.anchor) {
        const t = new Date(); t.setHours(0, 0, 0, 0)
        const d = new Date(e.anchor + 'T00:00:00')
        setBaseDate(d.getTime() === t.getTime() ? null : d)
      }
      setFlashId(e.id)
      setTimeout(() => setFlashId(null), 2200)
    },
    [viewPage],
  )

  // 加载超过 8 秒还没好 = 网络/服务问题，给出口别让人对着骨架干等
  const [loadTimeout, setLoadTimeout] = useState(false)
  useEffect(() => {
    if (loaded) return
    const t = setTimeout(() => setLoadTimeout(true), 8000)
    return () => clearTimeout(t)
  }, [loaded])

  if (needSetup) return <SetupCard user={user} onDone={loadProfiles} />
  if (me && me.status === 'pending')
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <img src="/logo.png" alt="" className="w-14 rounded-xl" />
        <p className="text-stone-700">你好 {me.display_name}，已收到你的加入申请</p>
        <p className="text-sm text-stone-400">等待邀请人确认后自动进入，这个页面不用刷新</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-2 text-xs text-stone-300 hover:text-stone-500">
          退出登录
        </button>
      </div>
    )
  // 首屏骨架：别让用户对着白屏等两个网络往返
  if (!me || !loaded)
    return loadTimeout ? (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-stone-600">加载有点慢，可能是网络问题</p>
        <button onClick={() => window.location.reload()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm text-white">
          刷新重试
        </button>
      </div>
    ) : (
      <div className="mx-auto flex h-screen max-w-4xl animate-pulse">
        <div className="hidden w-52 shrink-0 px-4 py-6 md:block">
          <div className="h-5 w-24 rounded bg-stone-100" />
          <div className="mt-6 h-10 rounded bg-stone-100" />
          <div className="mt-6 space-y-2">
            <div className="h-6 rounded bg-stone-100" />
            <div className="h-6 rounded bg-stone-100" />
          </div>
        </div>
        <div className="flex-1 px-6 py-6">
          <div className="h-20 rounded-xl bg-stone-100" />
          <div className="mt-8 space-y-3">
            <div className="h-4 w-12 rounded bg-stone-100" />
            <div className="h-5 w-3/4 rounded bg-stone-100" />
            <div className="h-5 w-2/3 rounded bg-stone-100" />
            <div className="h-5 w-1/2 rounded bg-stone-100" />
          </div>
        </div>
      </div>
    )

  const pageUser = profiles.find((p) => p.id === pageUserId) || me
  const isMyPage = pageUser.id === me.id

  return (
    <div className="mx-auto flex h-screen max-w-4xl overflow-hidden">
      {/* 左栏：人员列表（固定不随内容滚动） */}
      <aside className="hidden h-full w-52 shrink-0 flex-col overflow-y-auto px-2 pb-5 pt-3 md:flex">
        {/* 顶部：当前用户（和右侧日期行同一水平线、同级分量） */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[17px] font-bold">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg" />
          <span className="truncate">{me.display_name}</span>
        </div>
        {/* flomo 式三格统计：左中右铺开（首格贴左、末格贴右），数字行与右侧输入框平齐 */}
        <div className="mb-4 mt-5 flex justify-between px-2.5">
          {[
            ['today', '今日', 'items-start'],
            ['week', '本周', 'items-center'],
            ['done', '已完成', 'items-end'],
          ].map(([k, label, align]) => (
            <div key={k} className={`flex flex-col ${align}`}>
              <div className="text-[24px] font-bold leading-tight">{stats[k]}</div>
              <div className="mt-0.5 text-xs text-stone-300">{label}</div>
            </div>
          ))}
        </div>
        {/* flomo 式「全部目标」：无视周期看全量（时间锚定启用后才有意义，之前不显示） */}
        {hasAnchor && (
          <button
            onClick={() => setView(view === 'all' ? 'paper' : 'all')}
            className={
              'mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] ' +
              (view === 'all' ? 'bg-blue-50 font-medium text-blue-700' : 'text-stone-600 hover:bg-stone-100')
            }
          >
            <LayoutList size={14} /> 全部目标
          </button>
        )}
        {activeProfiles.map((p) => (
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
          <img src="/logo.png" alt="" className="h-6 w-6 rounded-md" />
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {activeProfiles.map((p) => (
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
          <button onClick={() => document.getElementById('search-input')?.focus()} className="text-stone-400">
            <Search size={16} />
          </button>
          <button onClick={() => supabase.auth.signOut()} className="text-xs text-stone-400">
            退出
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 md:px-6">
        <div className="shrink-0 pb-4 pt-3">
          {/* 顶栏：左=日期锚（点了整张纸拨回任意一天），右=搜索（flomo 位） */}
          <div className="flex items-center justify-between gap-2">
            <span className="relative flex items-center gap-1.5">
              {hasAnchor ? (
                <>
                  <button
                    onClick={() => setDateOpen((v) => !v)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[15px] font-semibold text-stone-900 hover:bg-stone-100"
                    title="点击回看任何一天"
                  >
                    <CalendarDays size={16} /> {(baseDate || new Date()).getMonth() + 1}月{(baseDate || new Date()).getDate()}日 周
                    {'日一二三四五六'[(baseDate || new Date()).getDay()]}
                    {isLive ? ' · 今天' : ''}
                  </button>
                  {dateOpen && (
                    <DatePicker
                      value={baseDate}
                      onClose={() => setDateOpen(false)}
                      onSelect={(d) => {
                        if (!d) return setBaseDate(null)
                        const t = new Date(); t.setHours(0, 0, 0, 0)
                        setBaseDate(d.getTime() === t.getTime() ? null : d)
                      }}
                    />
                  )}
                  {!isLive && (
                    <button
                      onClick={() => setBaseDate(null)}
                      className="rounded-full bg-stone-100 px-2 py-px text-[11px] text-stone-500 hover:bg-stone-200"
                    >
                      回到今天
                    </button>
                  )}
                </>
              ) : (
                <span />
              )}
            </span>
            <span className="relative flex items-center">
              <Search size={14} className="pointer-events-none absolute left-3 text-stone-300" />
              <input
                id="search-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setQuery('')
                    e.target.blur()
                  }
                }}
                placeholder="搜索"
                className="w-40 rounded-lg border border-stone-200 bg-white py-1.5 pl-9 pr-2 text-[13px] outline-none placeholder:text-stone-300 focus:border-stone-300 md:w-64"
              />
              {!query && (
                <kbd className="pointer-events-none absolute right-2.5 text-[11px] text-stone-300">⌘K</kbd>
              )}
            </span>
          </div>
          {view !== 'notifications' && !isMyPage && (
            <div className="mt-2 text-[13px] text-stone-400">
              {pageUser.display_name} 的纸（只读）{view === 'all' ? ' · 全部' : ''}
            </div>
          )}
          {view !== 'notifications' && isMyPage && (
            <QuickCapture me={me} profiles={profiles} allEntries={allEntries} hasAnchor={hasAnchor} mutate={mutateEntries} />
          )}
          {(offline || syncSlow) && (
            <p className="mt-1.5 text-xs text-stone-400">
              {offline
                ? '网络已断开——刚写的内容还没保存，恢复网络前别关页面'
                : '正在同步，网络有点慢…'}
            </p>
          )}
        </div>
        {/* -ml-6 pl-6：把左侧 24px（拖把手的悬浮区）包进容器内，配合 overflow-x-hidden 不被裁掉 */}
        <div className="paper-scroll -ml-6 flex-1 overflow-y-auto overflow-x-hidden pb-24 pl-6 pr-1">
          {view === 'notifications' ? (
            <NotificationsPage
              mentions={mentions}
              resolvedMine={resolvedMine}
              dueMine={dueMine}
              pendingMembers={pendingMembers}
              profiles={profiles}
              onChanged={loadData}
              onMembersChanged={loadProfiles}
              mutate={mutateEntries}
              onBack={() => viewPage(me.id)}
              onJumpHome={() => viewPage(me.id)}
            />
          ) : (
            <>
              {isMyPage && view === 'paper' && <Inbox mentions={mentions} profiles={profiles} onChanged={loadData} />}
              {SECTIONS.map((sec) => (
                <Section
                  key={sec.key}
                  sec={sec}
                  entries={query.trim() ? allEntries : pageEntries}
                  me={me}
                  isMyPage={isMyPage}
                  profiles={profiles}
                  allEntries={allEntries}
                  hasAnchor={hasAnchor}
                  allTime={view === 'all'}
                  baseDate={baseDate}
                  isLive={isLive}
                  mutate={mutateEntries}
                  pushUndo={pushUndo}
                  flashId={flashId}
                  query={query}
                  editRequest={editRequest}
                  onEditRequest={setEditRequest}
                />
              ))}
            </>
          )}
        </div>
        </div>
      </main>
      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          me={me}
          email={user.email}
          allEntries={allEntries}
          profiles={profiles}
          onProfileSaved={loadProfiles}
        />
      )}
    </div>
  )
}
