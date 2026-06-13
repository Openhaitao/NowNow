import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bell, ChevronLeft, ChevronRight, CircleCheck, LayoutList, Menu, Pin, Search, Settings } from 'lucide-react'
import { supabase } from './lib/supabase'
import { friendlyDbError } from './lib/errors'
import { inPeriod, periodRange } from './lib/period'
import { DATE_TOKEN_RE, dateTokenState } from './lib/dates'
import DatePicker from './components/DatePicker'
import Inbox from './components/Inbox'
import NotificationsPage from './components/NotificationsPage'
import Section from './components/Section'
import TeamAllView from './components/TeamAllView'
import SettingsModal from './components/SettingsModal'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'stash', label: '暂存箱' },
]

const LAST_VIEWED_KEY = 'nownow_last_viewed'
const loadLastViewed = () => JSON.parse(localStorage.getItem(LAST_VIEWED_KEY) || '{}')

// 待我处理的唯一查询口径（fail-closed）：@我未认领未拒绝 + 源条目仍 open + 非我自己创建。
// fetchAll 和 realtime reloadMentions 共用这一个 builder，杜绝双路径漂移（Kent gate）。
const inboxMentionsQuery = (uid) =>
  supabase
    .from('mentions')
    .select('*, entries!mentions_entry_id_fkey!inner(content, creator, status)')
    .eq('mentioned', uid)
    .is('claimed_entry', null)
    .is('rejected_at', null)
    .eq('entries.status', 'open')
    .neq('entries.creator', uid)

// 首次进入：凭邀请链接起名进入（没有邀请 = 进不来）
// 侧栏成员行：直接按住名字拖动排序（顺序存本地，纯个人视图偏好，不进数据库）
// 拖动中的那一行用选中同款的蓝色高亮
function SortableMemberRow({ p, isMe, active, news, pinned, onClick, onTogglePin }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        'group/mem flex w-full items-center rounded-md px-2.5 py-1.5 text-[14px] max-md:py-2 ' +
        (isDragging ? 'z-10 ' : '') +
        (active || isDragging ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-100')
      }
    >
      {/* 按住名字拖动排序；点击进主页 */}
      <button {...attributes} {...listeners} onClick={onClick} className="flex min-w-0 flex-1 items-center text-left">
        <span className="truncate">
          {p.display_name}
          {isMe ? '（我）' : ''}
        </span>
      </button>
      {news && <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" title="有新动态" />}
      {/* 📌 默认隐藏，hover 出现；点击置顶/取消置顶（个人偏好，存本地） */}
      <button
        onClick={(e) => { e.stopPropagation(); onTogglePin(p.id) }}
        title={pinned ? '取消置顶' : '置顶'}
        className={
          'ml-1 shrink-0 rounded p-0.5 hover:text-stone-600 ' +
          (pinned ? 'text-stone-500 opacity-100' : 'text-stone-300 opacity-0 group-hover/mem:opacity-100 max-md:opacity-60')
        }
      >
        <Pin size={12} className={pinned ? 'fill-current' : ''} />
      </button>
    </div>
  )
}

const MEMBER_ORDER_KEY = 'nownow_member_order'
const PINNED_KEY = 'nownow_pinned_members'

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
      <form onSubmit={save} className="w-full max-w-xs rounded-lg border border-stone-200 bg-white p-7">
        <h2 className="text-lg font-semibold">第一次来，起个名字</h2>
        <label className="mt-4 block text-xs text-stone-500">
          名字（显示用它，@你 也用它；中英文都行，如 海涛）
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-stone-200 px-3 py-2 text-[15px] text-stone-900 outline-none focus:border-stone-400"
          />
        </label>
        <button type="submit" className="mt-5 w-full rounded-md bg-stone-900 py-2.5 text-[15px] text-white hover:bg-stone-700">
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
  const [channel, setChannel] = useState('today') // 当前频道：today/week/month/stash（一次只看一个）
  // 每个频道各自的时间回看偏移（负=往前看）。‹ › 挪到了顶部频道标签旁，offset 上提到这里统一管
  const [offsets, setOffsets] = useState({})
  const channelOffset = offsets[channel] || 0
  const goChannel = useCallback((key) => {
    setChannel(key)
    setOffsets((o) => ({ ...o, [key]: 0 })) // 点标签名字 = 切到该频道并回到当前
  }, [])
  const stepChannel = useCallback((key, dir) => {
    setChannel(key)
    setOffsets((o) => ({ ...o, [key]: Math.min(0, (o[key] || 0) + dir) })) // 不能看未来，封顶 0
  }, [])
  const isLive = !baseDate

  // 跨频道接力：键盘流转到别的频道（如 today→week）时自动切过去，让目标 Section 挂载并接住 editRequest
  useEffect(() => {
    if (!editRequest) return
    const target = editRequest.split(':')[0]
    if (SECTIONS.some((s) => s.key === target) && target !== channel) setChannel(target)
  }, [editRequest]) // eslint-disable-line react-hooks/exhaustive-deps

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
      inboxMentionsQuery(user.id),
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
    const { data: ms } = await inboxMentionsQuery(user.id)
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
  const [mobileSearch, setMobileSearch] = useState(false) // 手机端搜索页模式
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
  // 团队成员列表 = 排除本人（本人入口走「我的目标」）；团队目标也用它，沿用同一排序
  const teamMembers = useMemo(() => orderedProfiles.filter((p) => p.id !== user.id), [orderedProfiles, user.id])

  // 置顶成员：个人偏好，存 localStorage，不进库、不影响别人。点 📌 切换某人是否置顶
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(PINNED_KEY) || '[]')) } catch { return new Set() }
  })
  const togglePin = useCallback((id) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      localStorage.setItem(PINNED_KEY, JSON.stringify([...next]))
      return next
    })
  }, [])
  const pinnedMembers = useMemo(() => teamMembers.filter((p) => pinnedIds.has(p.id)), [teamMembers, pinnedIds])
  const restMembers = useMemo(() => teamMembers.filter((p) => !pinnedIds.has(p.id)), [teamMembers, pinnedIds])
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

  // 「待我处理 / 我派出去的」侧栏入口已按 Haitao 移除；mentions/notifications 底层数据保留，要恢复见 git 3e4455d
  const inboxCount = mentions.length // 还用在手机 ☰ 红点（@我窄条仍在「我的目标」里）
  const notifCount = resolvedMine.length + dueMine.length + pendingMembers.length

  // 三格：今日未完成 / 本周未完成（今天还要干啥）+ 累计已完成（成就感，flomo 的"863 笔记"对应物）
  // 搜索跳转：纸拨回那条所在的日期 + 高亮闪烁定位
  const jumpToEntry = useCallback(
    (e) => {
      viewPage(e.owner)
      if (e.section) setChannel(e.section) // 切到目标所在频道，否则单频道视图下看不到
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
        <img src="/logo.png" alt="" className="w-14 rounded-lg" />
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
        <button onClick={() => window.location.reload()} className="rounded-md bg-stone-900 px-4 py-2 text-sm text-white">
          刷新重试
        </button>
      </div>
    ) : (
      <div className="mx-auto flex h-screen max-w-[970px] animate-pulse">
        <div className="hidden w-52 shrink-0 px-4 py-6 md:block">
          <div className="h-5 w-24 rounded-md bg-stone-100" />
          <div className="mt-6 h-10 rounded-md bg-stone-100" />
          <div className="mt-6 space-y-2">
            <div className="h-6 rounded-md bg-stone-100" />
            <div className="h-6 rounded-md bg-stone-100" />
          </div>
        </div>
        <div className="flex-1 px-6 py-6">
          <div className="h-20 rounded-lg bg-stone-100" />
          <div className="mt-8 space-y-3">
            <div className="h-4 w-12 rounded-md bg-stone-100" />
            <div className="h-5 w-3/4 rounded-md bg-stone-100" />
            <div className="h-5 w-2/3 rounded-md bg-stone-100" />
            <div className="h-5 w-1/2 rounded-md bg-stone-100" />
          </div>
        </div>
      </div>
    )

  const pageUser = profiles.find((p) => p.id === pageUserId) || me
  const isMyPage = pageUser.id === me.id

  // 侧栏内容：桌面常驻左栏 + 手机左侧抽屉（flomo 式）共用一份
  const sidebarContent = (
    <>
        {/* 顶部：logo + 用户名（桌面）／日期（手机抽屉头） */}
        <div className="mb-4 flex items-center gap-2 px-2.5 py-1.5 text-[17px] font-bold max-md:text-[21px]">
          <img src="/logo.png" alt="" className="h-7 w-7 rounded-md max-md:hidden" />
          <span className="truncate max-md:hidden">{me.display_name}</span>
          <span className="truncate md:hidden">
            {(baseDate || new Date()).getMonth() + 1}月{(baseDate || new Date()).getDate()}日
          </span>
          {/* 手机：通知/设置收进右侧（flomo 式抽屉头），点击进对应整页 */}
          <span className="-mr-2.5 ml-auto flex items-center gap-0.5 md:hidden">
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
        {/* 段1 · 看什么：我的目标 + 团队目标（待我处理/我派出去的 已按 Haitao 移除） */}
        <button
          onClick={() => viewPage(me.id)}
          className={
            'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] max-md:py-2 ' +
            (view === 'paper' && isMyPage ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-100')
          }
        >
          <CircleCheck size={16} /> 我的目标
        </button>
        <button
          onClick={() => setView('all')}
          className={
            'mt-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] max-md:py-2 ' +
            (view === 'all' ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-600 hover:bg-stone-100')
          }
        >
          <LayoutList size={16} /> 团队目标
        </button>

        {/* 段2 · 置顶成员 + 团队成员（都不含本人；📌 切换置顶，存本地个人偏好）。置顶成员上方不再画分隔线 */}
        <div className="mt-3" />
        {/* 成员多到放不下时这一段自己滚动（细灰滚动条），通知/设置钉在底部不动 */}
        <div className="paper-scroll min-h-0 flex-1 overflow-y-auto">
          <DndContext sensors={memberSensors} collisionDetection={closestCenter} onDragEnd={onMemberDragEnd}>
            {pinnedMembers.length > 0 && (
              <>
                <div className="mb-1 px-2.5 text-[12px] font-medium uppercase tracking-wide text-stone-300">
                  置顶成员
                </div>
                <SortableContext items={pinnedMembers.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                  {pinnedMembers.map((p) => (
                    <SortableMemberRow
                      key={p.id}
                      p={p}
                      isMe={p.id === me.id}
                      active={p.id === pageUserId && view === 'paper'}
                      news={hasNews(p)}
                      pinned
                      onClick={() => viewPage(p.id)}
                      onTogglePin={togglePin}
                    />
                  ))}
                </SortableContext>
                <div className="mt-3" />
              </>
            )}
            <div className="mb-1 px-2.5 text-[12px] font-medium uppercase tracking-wide text-stone-300">
              团队成员
            </div>
            <SortableContext items={restMembers.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              {restMembers.map((p) => (
                <SortableMemberRow
                  key={p.id}
                  p={p}
                  isMe={p.id === me.id}
                  active={p.id === pageUserId && view === 'paper'}
                  news={hasNews(p)}
                  pinned={false}
                  onClick={() => viewPage(p.id)}
                  onTogglePin={togglePin}
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
              'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] hover:bg-stone-100 ' +
              (view === 'notifications' ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-500')
            }
          >
            <Bell size={16} /> 通知
            {notifCount > 0 && (
              <span className="ml-auto rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">
                {notifCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[14px] text-stone-500 hover:bg-stone-100"
          >
            <Settings size={16} /> 设置
          </button>
        </div>
    </>
  )

  return (
    // 桌面：整个 app 左右细边框（主页边界感）；侧栏右边框做分界。相邻处只有侧栏这一条线，不重复。手机不画框不占面积
    <div className="mx-auto flex h-dvh max-w-[970px] overflow-hidden md:border-x md:border-stone-200">
      {/* 左栏：人员列表（固定不随内容滚动） */}
      <aside className="hidden h-full w-52 shrink-0 flex-col overflow-hidden border-r border-stone-100 px-2 pb-5 pt-3 md:flex">
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
                className="w-full rounded-lg bg-stone-100 px-4 py-2 text-[17px] outline-none placeholder:text-stone-400"
              />
            </span>
          ) : (
            <>
              <button onClick={() => setDrawerOpen(true)} className="relative p-1.5 text-stone-600" title="菜单">
                <Menu size={20} />
                {inboxCount + notifCount > 0 && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" />}
              </button>
              <button
                onClick={() => viewPage(me.id)}
                className={'min-w-0 flex-1 truncate text-center text-[17.5px] font-semibold ' + (view === 'paper' && !isMyPage ? 'text-stone-400' : '')}
              >
                {view === 'all'
                  ? '团队目标'
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

        <div className="flex min-h-0 flex-1 flex-col pl-5 pr-3 md:px-6">
        <div className="shrink-0 pb-4 pt-3 max-md:pb-2 max-md:pt-1">
          {/* 四频道切换器（替代日期标题）：今日/本周/本月/暂存箱，一次看一个。日期只在「今日」旁淡灰小字。右侧=搜索（桌面） */}
          {view === 'paper' && (
          <div className="flex items-center gap-1">
            {SECTIONS.map((s) => {
              const stepper = s.key !== 'stash' && hasAnchor // 暂存箱无周期，不带 ‹ ›
              const activeTab = channel === s.key
              const off = offsets[s.key] || 0
              // 暂存箱：纯标签无箭头
              if (!stepper) {
                return (
                  <button
                    key={s.key}
                    onClick={() => goChannel(s.key)}
                    className={
                      'rounded-md px-2 py-1 text-[14px] ' +
                      (activeTab ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-400 hover:bg-stone-100')
                    }
                  >
                    {s.label}
                  </button>
                )
              }
              // 箭头槽位永远占位、位置固定不动；只有选中的频道里箭头才显形可点，其它频道槽位透明
              // → 切换频道时只有高亮和箭头颜色变化，标签尺寸不变，完全不动
              const arrowVis = activeTab
                ? 'text-stone-500 hover:bg-stone-300/60 hover:text-stone-900'
                : 'pointer-events-none text-transparent'
              return (
                <span
                  key={s.key}
                  className={
                    'flex items-center gap-0.5 rounded-md px-1 py-1 ' +
                    (activeTab ? 'bg-stone-200/80 font-medium text-stone-900' : 'text-stone-400 hover:bg-stone-100')
                  }
                >
                  <button onClick={() => stepChannel(s.key, -1)} title="往前看一段" className={'rounded p-0.5 transition-colors ' + arrowVis}>
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => goChannel(s.key)} className="px-0.5 text-[14px]">
                    {s.label}
                  </button>
                  <button
                    onClick={() => stepChannel(s.key, 1)}
                    disabled={!activeTab || off >= 0}
                    title="往后看一段"
                    className={
                      'rounded p-0.5 transition-colors disabled:hover:bg-transparent ' +
                      arrowVis +
                      (activeTab && off >= 0 ? ' !text-stone-300' : '')
                    }
                  >
                    <ChevronRight size={14} />
                  </button>
                </span>
              )
            })}
            {/* 回看中：显示在看哪天/哪周/哪月 + 一键回到当前 */}
            {channelOffset !== 0 && (
              <span className="ml-1 flex items-center gap-1 whitespace-nowrap text-[12px] text-stone-400">
                {periodRange(channel, channelOffset, baseDate).label}
                <button
                  onClick={() => goChannel(channel)}
                  className="rounded-md bg-stone-100 px-1.5 py-px text-stone-500 hover:bg-stone-200"
                >
                  回到当前
                </button>
              </span>
            )}
            <span className="relative ml-auto hidden items-center md:flex">
              <Search size={16} className="pointer-events-none absolute left-2.5 text-stone-400" />
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
                className="w-40 rounded-md border border-stone-200 bg-white py-1.5 pl-9 pr-2 text-[13px] outline-none focus:border-stone-300 md:w-56"
              />
              {!query && (
                <kbd className="pointer-events-none absolute left-9 text-[12px] text-stone-300">⌘+K</kbd>
              )}
            </span>
          </div>
          )}
          {view === 'paper' && !isMyPage && (
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
          {/* 独立输入框已删除 → 改为纸即输入：频道底部常驻幽灵行（见 Section） */}
          {(offline || syncSlow) && (
            <div className="mt-2 rounded-md bg-stone-100 px-3 py-2 text-center text-[13px] text-stone-500">
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
              resolvedMine={resolvedMine}
              dueMine={dueMine}
              pendingMembers={pendingMembers}
              profiles={profiles}
              onMembersChanged={loadProfiles}
              onJump={jumpToEntry}
            />
          ) : (
            <>
              {view === 'all' ? (
                <TeamAllView allEntries={allEntries} allMentions={allMentions} profiles={profiles} orderedPeople={[...pinnedMembers, ...restMembers]} me={me} mutate={mutateEntries} pushUndo={pushUndo} baseDate={baseDate} onPin={togglePin} pinnedIds={pinnedIds} />
              ) : (
                <>
              {isMyPage && view === 'paper' && <Inbox mentions={mentions} profiles={profiles} onChanged={loadData} />}
              {/* 单频道显示：只渲染当前选中的频道。暂存箱无周期，按 allTime 全显 */}
              {SECTIONS.filter((sec) => sec.key === channel).map((sec) => (
                <Section
                  key={sec.key}
                  sec={sec}
                  entries={query.trim() ? allEntries : pageEntries}
                  me={me}
                  isMyPage={isMyPage}
                  profiles={profiles}
                  allEntries={allEntries}
                  hasAnchor={hasAnchor}
                  allTime={view === 'all' || sec.key === 'stash'}
                  baseDate={baseDate}
                  isLive={isLive}
                  offset={channelOffset}
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
      {/* 手机端创建改为：点频道底部幽灵行就地开写（纸即输入），不再有浮动 ➕ 和底部记录抽屉 */}
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
