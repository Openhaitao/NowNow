import { useState } from 'react'
import { Pilcrow, SendHorizontal, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import { fmtDate } from '../lib/period'
import MentionInput from './MentionInput'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// flomo 式顶部快速捕捉：写任务 → @分配 → 挑放进哪个区 → 回车
export default function QuickCapture({ me, profiles, allEntries, hasAnchor, mutate, variant, autoFocus, onDone }) {
  const sheet = variant === 'sheet' // 手机底部抽屉模式：无边框、更矮、发完即收
  const [draft, setDraft] = useState('')
  const [section, setSection] = useState('today')
  const [isGoal, setIsGoal] = useState(true)

  function submit() {
    let content = draft.trim()
    if (!content) return
    let goal = isGoal
    if (content.startsWith('[]')) {
      goal = true
      content = content.slice(2).trim()
      if (!content) return
    }
    setDraft('')
    if (sheet) onDone?.()
    const sectionEntries = allEntries.filter((e) => e.owner === me.id && e.section === section)
    const maxPos = Math.max(0, ...sectionEntries.map((x) => x.position))
    const row = {
      owner: me.id,
      creator: me.id,
      section,
      content,
      is_goal: goal,
      position: maxPos + 1,
    }
    if (hasAnchor) row.anchor = fmtDate(new Date())
    const temp = {
      ...row,
      id: `tmp-${Date.now()}`,
      status: 'open',
      is_private: false,
      source_entry: null,
      anchor: row.anchor ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    mutate(
      (list) => [...list, temp],
      async () => {
        const { data, error } = await supabase.from('entries').insert(row).select().single()
        if (!error && data) await syncMentions(data.id, content, profiles, me.id)
      },
    )
  }

  return (
    <div className={sheet ? 'p-1' : 'mt-5 rounded-lg border border-stone-200 bg-white p-3 shadow-sm focus-within:border-stone-300'}>
      <MentionInput
        id="quick-capture"
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        profiles={profiles}
        rows={3}
        autoFocus={autoFocus}
        placeholder={sheet ? '现在要做什么？@ 派人' : '现在要做什么？@ 派人，回车存，Shift+回车换行（按 / 聚焦）'}
        className={'px-1 pt-0.5' + (sheet ? ' text-[16px]' : '')}
      />
      <div className="mt-2 flex items-center gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={
              (sheet ? 'rounded-md px-3.5 py-1 text-[15px] ' : 'rounded-md px-2.5 py-0.5 text-xs ') +
              (section === s.key ? 'bg-stone-900 text-white' : 'text-stone-400 hover:bg-stone-100')
            }
          >
            {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIsGoal((v) => !v)}
          title={isGoal ? '目标（带完成框）' : '备忘（一段话）'}
          className={'ml-1 flex items-center gap-1 rounded-md text-stone-400 hover:bg-stone-100 ' + (sheet ? 'px-3 py-1 text-[15px]' : 'px-2 py-0.5 text-xs')}
        >
          {isGoal ? <Square size={sheet ? 14 : 11} /> : <Pilcrow size={sheet ? 14 : 11} />}
          {isGoal ? '目标' : '备忘'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          title="存（回车，或 ⌘/Ctrl+回车）"
          className={'ml-auto flex items-center justify-center rounded-md bg-stone-900 text-white disabled:opacity-30 ' + (sheet ? 'h-10 w-14' : 'h-7 w-10')}
        >
          <SendHorizontal size={sheet ? 18 : 15} />
        </button>
      </div>
    </div>
  )
}
