import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// @匹配按已知 handle 精确比对（支持中文名，不靠"单词边界"——中文没有空格分词）
function findMentioned(content, profiles, meId) {
  const lc = content.toLowerCase()
  return profiles.filter((p) => p.id !== meId && lc.includes('@' + p.handle))
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function mentionSplitRegex(profiles) {
  if (!profiles.length) return null
  const alt = profiles.map((p) => escapeRegExp('@' + p.handle)).join('|')
  return new RegExp(`(${alt})`, 'gi')
}

// ---------- 登录 ----------

function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function sendLink(e) {
    e.preventDefault()
    setErr('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setErr(error.message)
    else setSent(true)
  }

  return (
    <div className="center-card">
      <img src="/logo.png" alt="NowNow" className="logo-lg" />
      <h1>NowNow</h1>
      {sent ? (
        <p>登录链接已发到 {email}，去邮箱点一下。</p>
      ) : (
        <form onSubmit={sendLink}>
          <input
            type="email"
            required
            placeholder="你的邮箱"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">发送登录链接</button>
          {err && <p className="error">{err}</p>}
        </form>
      )}
    </div>
  )
}

// ---------- 首次进入：起名字 ----------

function ProfileSetup({ user, onDone }) {
  const [handle, setHandle] = useState(user.email.split('@')[0].replace(/\W/g, ''))
  const [displayName, setDisplayName] = useState('')
  const [err, setErr] = useState('')

  async function save(e) {
    e.preventDefault()
    setErr('')
    const clean = handle.trim().replace(/^@/, '')
    if (!clean || /\s/.test(clean)) {
      setErr('@名不能为空或带空格')
      return
    }
    const { error } = await supabase.from('profiles').insert({
      id: user.id,
      handle: clean.toLowerCase(),
      display_name: displayName || clean,
    })
    if (error) setErr(error.message)
    else onDone()
  }

  return (
    <div className="center-card">
      <h2>第一次来，起个名字</h2>
      <form onSubmit={save}>
        <label>
          @名（别人这样喊你，中文/英文都行，如 海涛）
          <input value={handle} onChange={(e) => setHandle(e.target.value)} required />
        </label>
        <label>
          显示名
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="比如：海涛" />
        </label>
        <button type="submit">进入</button>
        {err && <p className="error">{err}</p>}
      </form>
    </div>
  )
}

// ---------- 条目 ----------

function EntryRow({ entry, me, profiles, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.content)
  const isMine = entry.owner === me.id
  const isCreator = entry.creator === me.id
  const closed = entry.status === 'closed'
  const resolved = entry.status === 'resolved'

  async function syncMentions(entryId, content) {
    const targets = findMentioned(content, profiles, me.id)
    for (const t of targets) {
      await supabase.from('mentions').upsert(
        { entry_id: entryId, mentioned: t.id },
        { onConflict: 'entry_id,mentioned', ignoreDuplicates: true },
      )
    }
  }

  async function saveEdit() {
    setEditing(false)
    if (text === entry.content) return
    await supabase.from('entries').update({ content: text }).eq('id', entry.id)
    await syncMentions(entry.id, text)
    onChanged()
  }

  async function toggleDone() {
    if (entry.source_entry) {
      // 认领来的：标已解决（球回创建者）+ 自己这份收尾
      await supabase.rpc('resolve_entry', { p_entry_id: entry.source_entry })
      await supabase.from('entries').update({ status: closed ? 'open' : 'closed' }).eq('id', entry.id)
    } else {
      // 自己的目标：直接完成/取消完成
      await supabase.from('entries').update({ status: closed ? 'open' : 'closed' }).eq('id', entry.id)
    }
    onChanged()
  }

  async function closeResolved() {
    await supabase.from('entries').update({ status: 'closed' }).eq('id', entry.id)
    onChanged()
  }

  async function togglePrivate() {
    await supabase.from('entries').update({ is_private: !entry.is_private }).eq('id', entry.id)
    onChanged()
  }

  async function remove() {
    await supabase.from('entries').delete().eq('id', entry.id)
    onChanged()
  }

  const splitRe = mentionSplitRegex(profiles)
  const renderedContent = splitRe
    ? entry.content.split(splitRe).map((part, i) =>
        part && part.startsWith('@') ? <span key={i} className="mention">{part}</span> : part,
      )
    : entry.content

  return (
    <div className={`entry ${closed ? 'closed' : ''} ${resolved ? 'resolved' : ''}`}>
      {entry.is_goal && (
        <input
          type="checkbox"
          checked={closed}
          disabled={!isMine}
          onChange={toggleDone}
          title={entry.source_entry ? '完成（会通知发起人）' : '完成'}
        />
      )}
      {editing && isMine ? (
        <textarea
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), saveEdit())}
        />
      ) : (
        <span className="content" onClick={() => isMine && setEditing(true)}>
          {renderedContent}
        </span>
      )}
      <span className="entry-actions">
        {resolved && isCreator && (
          <button className="btn-close" onClick={closeResolved} title="对方已解决，确认关闭">
            ✓ 关闭
          </button>
        )}
        {resolved && !isCreator && <span className="badge">已解决·待关闭</span>}
        {isMine && (
          <>
            <button className="icon" onClick={togglePrivate} title={entry.is_private ? '私密，点击公开' : '公开，点击私密'}>
              {entry.is_private ? '🔒' : '👁'}
            </button>
            {isCreator && (
              <button className="icon" onClick={remove} title="删除">
                ×
              </button>
            )}
          </>
        )}
      </span>
    </div>
  )
}

// ---------- 区块 ----------

function Section({ sec, entries, me, pageUser, profiles, onChanged }) {
  const [draft, setDraft] = useState('')
  const [isGoal, setIsGoal] = useState(true)
  const isMyPage = pageUser.id === me.id

  const sorted = useMemo(() => {
    const list = entries.filter((e) => e.section === sec.key)
    return [
      ...list.filter((e) => e.status !== 'closed').sort((a, b) => a.position - b.position),
      ...list.filter((e) => e.status === 'closed').sort((a, b) => a.position - b.position),
    ]
  }, [entries, sec.key])

  async function add(e) {
    e.preventDefault()
    const content = draft.trim()
    if (!content) return
    const minPos = Math.min(0, ...sorted.map((x) => x.position))
    const { data, error } = await supabase
      .from('entries')
      .insert({
        owner: me.id,
        creator: me.id,
        section: sec.key,
        content,
        is_goal: isGoal,
        position: minPos - 1,
      })
      .select()
      .single()
    if (!error && data) {
      const targets = findMentioned(content, profiles, me.id)
      for (const t of targets) {
        await supabase.from('mentions').insert({ entry_id: data.id, mentioned: t.id })
      }
    }
    setDraft('')
    onChanged()
  }

  return (
    <section className="section">
      <h3>{sec.label}</h3>
      {isMyPage && (
        <form className="add-row" onSubmit={add}>
          <button
            type="button"
            className={`type-toggle ${isGoal ? 'goal' : ''}`}
            onClick={() => setIsGoal(!isGoal)}
            title={isGoal ? '目标（带完成框）' : '备忘（一段话）'}
          >
            {isGoal ? '☐' : '¶'}
          </button>
          <input
            placeholder={`记到「${sec.label}」… @某人 可以派给他`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </form>
      )}
      {sorted.map((e) => (
        <EntryRow key={e.id} entry={e} me={me} profiles={profiles} onChanged={onChanged} />
      ))}
      {sorted.length === 0 && <p className="empty">—</p>}
    </section>
  )
}

// ---------- 收件箱 ----------

function Inbox({ mentions, profiles, onChanged }) {
  async function claim(m, section) {
    await supabase.rpc('claim_mention', { p_mention_id: m.id, p_section: section })
    onChanged()
  }
  if (mentions.length === 0) return null
  return (
    <section className="section inbox">
      <h3>@我的</h3>
      {mentions.map((m) => {
        const from = profiles.find((p) => p.id === m.entries?.creator)
        return (
          <div className="entry" key={m.id}>
            <span className="content">
              <b>{from?.display_name || '?'}：</b>
              {m.entries?.content}
            </span>
            <span className="entry-actions">
              {SECTIONS.map((s) => (
                <button key={s.key} className="btn-claim" onClick={() => claim(m, s.key)}>
                  收进{s.label}
                </button>
              ))}
            </span>
          </div>
        )
      })}
    </section>
  )
}

// ---------- 主页面 ----------

function Board({ session }) {
  const user = session.user
  const [profiles, setProfiles] = useState([])
  const [me, setMe] = useState(null)
  const [needSetup, setNeedSetup] = useState(false)
  const [pageUserId, setPageUserId] = useState(null)
  const [entries, setEntries] = useState([])
  const [mentions, setMentions] = useState([])

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
    const mine = (data || []).find((p) => p.id === user.id)
    setMe(mine || null)
    setNeedSetup(!mine)
    if (mine && !pageUserId) setPageUserId(mine.id)
  }, [user.id, pageUserId])

  const loadData = useCallback(async () => {
    if (!pageUserId) return
    const [{ data: es }, { data: ms }] = await Promise.all([
      supabase.from('entries').select('*').eq('owner', pageUserId),
      supabase
        .from('mentions')
        .select('*, entries!mentions_entry_id_fkey(content, creator)')
        .eq('mentioned', user.id)
        .is('claimed_entry', null),
    ])
    setEntries(es || [])
    setMentions(ms || [])
  }, [pageUserId, user.id])

  useEffect(() => { loadProfiles() }, [loadProfiles])
  useEffect(() => { loadData() }, [loadData])

  // Realtime：库一变就重拉（两个人的量级，重拉最简单可靠）
  useEffect(() => {
    const ch = supabase
      .channel('nownow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mentions' }, loadData)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadData])

  if (needSetup) return <ProfileSetup user={user} onDone={loadProfiles} />
  if (!me) return <div className="center-card">加载中…</div>

  const pageUser = profiles.find((p) => p.id === pageUserId) || me

  return (
    <div className="board">
      <header>
        <img src="/logo.png" alt="" className="logo-sm" />
        <span className="brand">NowNow</span>
        <nav>
          {profiles.map((p) => (
            <button
              key={p.id}
              className={`tab ${p.id === pageUserId ? 'active' : ''}`}
              onClick={() => setPageUserId(p.id)}
            >
              {p.display_name}
              {p.id === me.id ? '（我）' : ''}
            </button>
          ))}
        </nav>
        <button className="signout" onClick={() => supabase.auth.signOut()}>退出</button>
      </header>
      {pageUserId === me.id && <Inbox mentions={mentions} profiles={profiles} onChanged={loadData} />}
      <main>
        {SECTIONS.map((sec) => (
          <Section
            key={sec.key}
            sec={sec}
            entries={entries}
            me={me}
            pageUser={pageUser}
            profiles={profiles}
            onChanged={loadData}
          />
        ))}
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  return session ? <Board session={session} /> : <Login />
}
