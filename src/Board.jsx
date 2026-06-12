import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bell, CalendarDays, LayoutList, Menu, Plus, Search, Settings } from 'lucide-react'
import { supabase } from './lib/supabase'
import { friendlyDbError } from './lib/errors'
import { inPeriod, periodRange } from './lib/period'
import { DATE_TOKEN_RE, dateTokenState } from './lib/dates'
import DatePicker from './components/DatePicker'
import Inbox from './components/Inbox'
import NotificationsPage from './components/NotificationsPage'
import QuickCapture from './components/QuickCapture'
import Section from './components/Section'
import TeamAllView from './components/TeamAllView'
import SettingsModal from './components/SettingsModal'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

const LAST_VIEWED_KEY = 'nownow_last_viewed'
const loadLastViewed = () => JSON.parse(localStorage.getItem(LAST_VIEWED_KEY) || '{}')

// 首次进入：凭邀请链接起名进入（没有邀请 = 进不来）
// 侧栏成员行：直接按住名字拖动排序（顺序存本地，纯个人视图偏好，不进数据库）
// 拖动中的那一行用选中同款的蓝色高亮
function SortableMemberRow({ p, isMe, active, news, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onClick}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        'flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13.5px] max-md:py-2 max-md:text-[16.5px] ' +
        (isDragging ? 'z-10 ' : '') +
        (active || isDragging ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-100')
      }
    >
      <span className="truncate">
        {p.display_name}
        {isMe ? '（我）' : ''}
      </span>
      {news && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-red-500" title="有新动态" />}
    </button>
  )
}

const MEMBER_ORDER_KEY = 'nownow_member_order'

function SetupCard({ user, onDone }) {
  // 邀请页已经填过名字的话直接自动认领进入，不再问一遍
  const pendingName = localStorage.getItem('nownow_pending_name') || ''
  const [handle, setHandle] = useState(pendingName || user.email.split('@')[0].replace(/\W/g, ''))
  const [err, setErr] = useState('')
  const [auto, setAuto] = useState(!!pendingName)
  const autoFired = useRef(false)
  const invite = localStorage.getItem('nownow_invite')

  async function claim(raw) {
    setErr('')
    const clean = raw.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) { setAuto(false); setErr('名字不能为空或带空格'); return }
    const { error } = await supabase.rpc('claim_membership', { p_name: clean })
    if (error) {
      // 兼容旧路径：还留着邀请 token 的话试一下 redeem
      if (invite) {
        const { error: e2 } = await supabase.rpc('redeem_invite', { p_token: invite, p_name: clean })
        if (!e2) { localStorage.removeItem('nownow_invite'); localStorage.removeItem('nownow_pending_name'); onDone(); return }
      }
      setAuto(false)
      setErr(friendlyDbError(error.message))
      return
    }
    localStorage.removeItem('nownow_invite')
    localStorage.removeItem('nownow_pending_name')
    onDone()
  }

  useEffect(() => {
    if (auto && !autoFired.current) {
      autoFired.current = true
      claim(pendingName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function save(e) {
    e.preventDefault()
    claim(handle)
  }

  if (auto)
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-stone-400">正在进入…</p>
      </div>
    )

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
  const [allMentions, setAllMentions] = useState([])
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
    const [{ data: es }, { data: ms }, { data: am }] = await Promise.all([
      supabase.from('entries').select('*'),
      supabase
        .from('mentions')
        .select('*, entries!mentions_entry_id_fkey(content, creator)')
        .eq('mentioned', user.id)
        .is('claimed_entry', null)
        .is('rejected_at', null),
      supabase.from('mentions').select('entry_id, mentioned, claimed_entry, rejected_at'),
    ])
    return { es: es || [], ms: ms || [], am: am || [] }
  }, [user.id])

  const applyLoad = useCallback(
    ({ es, ms, am }) => {
      // 自愈：清掉空内容的孤儿条目（正常路径建不出空条，出现=历史 bug 残留）
      const strays = es.filter((e) => e.owner === user.id && !e.content.trim())
      for (const stray of strays) supabase.from('entries').delete().eq('id', stray.id)
      setAllEntries(es.filter((e) => !strays.includes(e)))
      setMentions(ms)
      setAllMentions(am)
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

  // 失败的写操作进重试队列：断网期间的改动恢复网络后自动补存
  const retryQueue = useRef([])

  // 乐观更新（flomo 式先本地后同步）：UI 立即生效，服务端后台跑，全部落完才与库对齐
  const mutateEntries = useCallback(
    (transform, op) => {
      mutEpoch.current++
      setAllEntries(transform)
      pendingOps.current++
      setSyncing(true)
      Promise.resolve()
        .then(op)
        .catch(() => {
          retryQueue.current.push({ op, tries: 0 })
        })
        .finally(() => {
          pendingOps.current--
          if (pendingOps.current === 0) setSyncing(false)
          loadData()
        })
    },
    [loadData],
  )

  // 恢复网络后按顺序重放失败的操作（最多重试 3 次，防非网络性错误死循环）
  const replayFailed = useCallback(async () => {
    const q = retryQueue.current
    if (!q.length) return
    retryQueue.current = []
    mutEpoch.current++
    pendingOps.current++
    setSyncing(true)
    for (const it of q) {
      try {
        await it.op()
      } catch {
        if (++it.tries < 3) retryQueue.current.push(it)
      }
    }
    pendingOps.current--
    if (pendingOps.current === 0) setSyncing(false)
    loadData()
  }, [loadData])

  // 只在"有问题"时提示：离线 / 同步卡了超过 2.5 秒（顺畅时完全安静）
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => { setOffline(false); replayFailed() }
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [replayFailed])
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

  // Realtime 增量应用：别人的改动按行打补丁，不整表重拉（30 人规模的流量关键）
  // 自己有写操作在路上时不动本地（防旧事件盖新状态），靠落定后的对账兜底
  const applyEntryEvent = useCallback((payload) => {
    if (pendingOps.current > 0) return
    const { eventType, new: n, old: o } = payload
    setAllEntries((list) => {
      if (eventType === 'INSERT') return list.some((e) => e.id === n.id) ? list : [...list, n]
      if (eventType === 'UPDATE') return list.map((e) => (e.id === n.id ? n : e))
      if (eventType === 'DELETE') return list.filter((e) => e.id !== (o?.id ?? n?.id))
      return list
    })
  }, [])

  const reloadMentions = useCallback(async () => {
    const { data: ms } = await supabase
      .from('mentions')
      .select('*, entries!mentions_entry_id_fkey(content, creator)')
      .eq('mentioned', user.id)
      .is('claimed_entry', null)
      .is('rejected_at', null)
    setMentions(ms || [])
  }, [user.id])

  useEffect(() => {
    const ch = supabase
      .channel('nownow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, applyEntryEvent)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mentions' }, reloadMentions)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadProfiles)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [applyEntryEvent, reloadMentions, loadProfiles])

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
    if (me) {
      document.title = `${me.display_name} | NowNow`
      // 记住名字给登录页打招呼用；已是成员就清掉邀请页暂存的名字，防止串号
      localStorage.setItem('nownow_last_name', me.display_name)
      localStorage.removeItem('nownow_pending_name')
    }
  }, [me])

  // 桌面端打开即可打字（手机不自动弹键盘）
  useEffect(() => {
    if (loaded && me && window.innerWidth >= 768) {
      document.getElementById('quick-capture')?.focus()
    }
  }, [loaded, me?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false) // 手机端左侧抽屉（flomo 式）
  const [composeOpen, setComposeOpen] = useState(false) // 手机端 ➕ 记录抽屉
  const [mobileSearch, setMobileSearch] = useState(false) // 手机端搜索页模式
  const [kbOffset, setKbOffset] = useState(0)
  useEffect(() => {
    // iOS 键盘不会推动 fixed 元素：用 visualViewport 实测键盘高度，把记录抽屉顶上去
    if (!composeOpen || !window.visualViewport) return
    const vv = window.visualViewport
    const h = () => setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    vv.addEventListener('resize', h)
    vv.addEventListener('scroll', h)
    h()
    return () => { vv.removeEventListener('resize', h); vv.removeEventListener('scroll', h); setKbOffset(0) }
  }, [composeOpen])
  const [view, setView] = useState('paper') // paper | notifications | all
  useEffect(() => {
    // 去了别的页面就退出搜索模式并清空关键词（必须放在 view 声明之后：deps 数组在渲染时求值）
    setMobileSearch(false)
    setQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, pageUserId])
  const searchBoxRef = useRef(null)
  useEffect(() => {
    // 搜索框：点它以外的任何地方立即收起并清空（用户拍板的交互）
    if (!mobileSearch) return
    const h = (e) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setMobileSearch(false)
        setQuery('')
      }
    }
    document.addEventListener('pointerdown', h)
    return () => document.removeEventListener('pointerdown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileSearch])

  // 成员显示顺序：本人默认第一位，拖拽可调，存本地
  const [memberOrder, setMemberOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem(MEMBER_ORDER_KEY) || '[]') } catch { return [] }
  })
  const orderedProfiles = useMemo(() => {
    const rank = (p) => {
      const i = memberOrder.indexOf(p.id)
      if (i !== -1) return i
      return p.id === user.id ? -1 : memberOrder.length + activeProfiles.indexOf(p)
    }
    return [...activeProfiles].sort((a, b) => rank(a) - rank(b))
  }, [activeProfiles, memberOrder, user.id])
  const memberSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  function onMemberDragEnd({ active, over }) {
    if (!over || active.id === over.id) return
    const ids = orderedProfiles.map((p) => p.id)
    const next = arrayMove(ids, ids.indexOf(active.id), ids.indexOf(over.id))
    setMemberOrder(next)
    localStorage.setItem(MEMBER_ORDER_KEY, JSON.stringify(next))
  }

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

  // 侧栏内容：桌面常驻左栏 + 手机左侧抽屉（flomo 式）共用一份
  const sidebarContent = (
    <>
        {/* 顶部：当前用户（和右侧日期行同一水平线、同级分量） */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[17px] font-bold max-md:text-[21px]">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg max-md:hidden" />
          {/* 手机抽屉头=日期，桌面左栏=用户名 */}
          <span className="truncate max-md:hidden">{me.display_name}</span>
          <span className="truncate md:hidden">
            {(baseDate || new Date()).getMonth() + 1}月{(baseDate || new Date()).getDate()}日
          </span>
          {/* 手机：通知/设置收进名字右侧（flomo 式抽屉头），点击进对应整页 */}
          <span className="ml-auto flex items-center gap-0.5 md:hidden">
            <button onClick={() => setView('notifications')} className="relative p-1.5 text-stone-500" title="通知">
              <Bell size={22} />
              {notifCount > 0 && (
                <span className="absolute right-0.5 top-0.5 rounded-full bg-red-500 px-1 text-[10px] font-medium leading-[14px] text-white">{notifCount}</span>
              )}
            </button>
            <button onClick={() => setView('settings')} className="p-1.5 text-stone-500" title="设置">
              <Settings size={22} />
            </button>
          </span>
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
        {/* 视图入口与人员列表分组：全部目标在上，团队成员单独一组 */}
        {hasAnchor && (
          <button
            onClick={() => setView(view === 'all' ? 'paper' : 'all')}
            className={
              'mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] max-md:py-2 max-md:text-[16.5px] ' +
              (view === 'all' ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-100')
            }
          >
            <LayoutList size={14} /> 全部目标
          </button>
        )}
        <div className="mb-1 mt-3 px-2.5 text-[11px] font-medium uppercase tracking-wide text-stone-300 max-md:text-[12.5px]">
          团队
        </div>
        {/* 成员多到放不下时这一段自己滚动（细灰滚动条），通知/设置钉在底部不动 */}
        <div className="paper-scroll min-h-0 flex-1 overflow-y-auto">
          <DndContext sensors={memberSensors} collisionDetection={closestCenter} onDragEnd={onMemberDragEnd}>
            <SortableContext items={orderedProfiles.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {orderedProfiles.map((p) => (
                <SortableMemberRow
                  key={p.id}
                  p={p}
                  isMe={p.id === me.id}
                  active={p.id === pageUserId && view === 'paper'}
                  news={hasNews(p)}
                  onClick={() => viewPage(p.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        {/* 底部：通知（完整页面）+ 设置（桌面；手机入口在抽屉头名字右侧） */}
        <div className="mt-auto max-md:hidden">
          <button
            onClick={() => setView(view === 'notifications' ? 'paper' : 'notifications')}
            className={
              'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-stone-100 ' +
              (view === 'notifications' ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-500')
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
    </>
  )

  return (
    <div className="mx-auto flex h-dvh max-w-4xl overflow-hidden">
      {/* 左栏：人员列表（固定不随内容滚动） */}
      <aside className="hidden h-full w-52 shrink-0 flex-col overflow-hidden px-2 pb-5 pt-3 md:flex">
        {sidebarContent}
      </aside>

      {/* 手机端：flomo 式左侧抽屉，滑入滑出带过渡（常驻挂载，开关只切 transform/opacity） */}
      <div className={'fixed inset-0 z-50 md:hidden ' + (drawerOpen ? '' : 'pointer-events-none')}>
        <div
          className={'absolute inset-0 bg-black/30 transition-opacity duration-200 ' + (drawerOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={
            'absolute inset-y-0 left-0 flex w-60 flex-col overflow-hidden bg-[#fffefb] px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(0.375rem,env(safe-area-inset-top))] shadow-2xl transition-transform duration-200 ease-out ' +
            (drawerOpen ? 'translate-x-0' : '-translate-x-full')
          }
          onClick={() => setDrawerOpen(false)}
        >
          {sidebarContent}
        </div>
      </div>

      {/* 主区：输入框固定，纸内部滚动 */}
      <main className="flex h-full min-w-0 flex-1 flex-col">
        {/* 移动端顶栏（flomo 式）：☰ 抽屉 + 中间日期锚 + 搜索页入口；搜索模式下整条变搜索框 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-100 px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] md:hidden">
          {mobileSearch ? (
            <span ref={searchBoxRef} className="min-w-0 flex-1">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索内容或人名"
                className="w-full rounded-xl bg-stone-100 px-4 py-2 text-[17px] outline-none placeholder:text-stone-400"
              />
            </span>
          ) : (
            <>
              <button onClick={() => setDrawerOpen(true)} className="relative p-1.5 text-stone-600" title="菜单">
                <Menu size={20} />
                {notifCount > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />}
              </button>
              <button
                onClick={() => viewPage(me.id)}
                className="min-w-0 flex-1 truncate text-center text-[17.5px] font-semibold"
              >
                {view === 'all'
                  ? '全部目标'
                  : view === 'notifications'
                    ? '通知'
                    : view === 'settings'
                      ? '设置'
                      : pageUser.display_name}
              </button>
              <button onClick={() => setMobileSearch(true)} className="p-1.5 text-stone-400">
                <Search size={20} />
              </button>
            </>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-5 md:px-6">
        <div className="shrink-0 pb-4 pt-3 max-md:pb-2 max-md:pt-1">
          {/* 顶栏：左=日期锚（点了整张纸拨回任意一天），右=搜索（flomo 位）。手机端隐藏：日期在顶栏中间、搜索是独立页 */}
          <div className="flex items-center justify-between gap-2 max-md:hidden">
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
          {view !== 'notifications' && view !== 'settings' && !isMyPage && (
            <div className="mt-2 flex items-center justify-between text-[13px] text-stone-400 max-md:hidden">
              <span>{pageUser.display_name}的主页（只读）</span>
              <button
                onClick={() => viewPage(me.id)}
                className="text-stone-400 transition-colors hover:text-stone-600"
              >
                ← 回到我的主页
              </button>
            </div>
          )}
          {(view === 'notifications' || view === 'settings') && (
            <div className="mt-2 flex items-center justify-between text-[13px] text-stone-400 max-md:hidden">
              <span>{view === 'notifications' ? '通知' : '设置'}</span>
              <button
                onClick={() => viewPage(me.id)}
                className="text-stone-400 transition-colors hover:text-stone-600"
              >
                ← 回到我的主页
              </button>
            </div>
          )}
          {view === 'paper' && isMyPage && (
            <div className="max-md:hidden">
              <QuickCapture me={me} profiles={profiles} allEntries={allEntries} hasAnchor={hasAnchor} mutate={mutateEntries} />
            </div>
          )}
          {(offline || syncSlow) && (
            <div className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-center text-[13px] text-stone-500">
              {offline ? '离线状态，内容已暂存本页，恢复网络后自动保存，' : '正在同步，网络有点慢，'}
              <button
                onClick={() => { replayFailed(); loadData() }}
                className="text-blue-600 hover:underline"
              >
                点此重试
              </button>
            </div>
          )}
        </div>
        {/* -ml-6 pl-6：把左侧 24px（拖把手的悬浮区）包进容器内，配合 overflow-x-hidden 不被裁掉 */}
        <div className="paper-scroll -ml-6 flex-1 overflow-y-auto overflow-x-hidden pb-24 pl-6 pr-1">
          {view === 'settings' ? (
            <SettingsModal
              variant="page"
              me={me}
              email={user.email}
              allEntries={allEntries}
              profiles={profiles}
              onProfileSaved={loadProfiles}
            />
          ) : view === 'notifications' ? (
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
              {view === 'all' ? (
                <TeamAllView allEntries={allEntries} allMentions={allMentions} profiles={profiles} orderedPeople={orderedProfiles} me={me} mutate={mutateEntries} pushUndo={pushUndo} baseDate={baseDate} />
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
                  allMentions={allMentions}
                />
              ))}
                </>
              )}
            </>
          )}
        </div>
        </div>

      </main>
      {/* 手机端浮动记录按钮（flomo 式）：弹出底部记录抽屉 */}
      {view === 'paper' && isMyPage && !composeOpen && (
        <button
          onClick={() => setComposeOpen(true)}
          className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg active:scale-95 md:hidden"
          title="记一条"
        >
          <Plus size={22} />
        </button>
      )}
      {/* 手机端记录抽屉：flomo 同款，紧贴软键盘 */}
      {composeOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setComposeOpen(false)} />
          <div
            className="absolute inset-x-0 rounded-t-2xl bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            style={{ bottom: kbOffset }}
          >
            <QuickCapture
              me={me}
              profiles={profiles}
              allEntries={allEntries}
              hasAnchor={hasAnchor}
              mutate={mutateEntries}
              variant="sheet"
              autoFocus
              onDone={() => setComposeOpen(false)}
            />
          </div>
        </div>
      )}
      {settingsOpen && (
        <SettingsModal
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
