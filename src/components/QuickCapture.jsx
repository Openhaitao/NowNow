import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import MentionInput from './MentionInput'

const SECTIONS = [
  { key: 'today', label: '今日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
]

// flomo 式顶部快速捕捉：写任务 → @分配 → 挑放进哪个区 → 回车
export default function QuickCapture({ me, profiles, allEntries, onChanged }) {
  const [draft, setDraft] = useState('')
  const [section, setSection] = useState('today')
  const [isGoal, setIsGoal] = useState(true)

  async function submit() {
    let content = draft.trim()
    if (!content) return
    let goal = isGoal
    if (content.startsWith('[]')) {
      goal = true
      content = content.slice(2).trim()
      if (!content) return
    }
    const sectionEntries = allEntries.filter((e) => e.owner === me.id && e.section === section)
    const maxPos = Math.max(0, ...sectionEntries.map((x) => x.position))
    const { data, error } = await supabase
      .from('entries')
      .insert({
        owner: me.id,
        creator: me.id,
        section,
        content,
        is_goal: goal,
        position: maxPos + 1,
      })
      .select()
      .single()
    if (!error && data) await syncMentions(data.id, content, profiles, me.id)
    setDraft('')
    onChanged()
  }

  return (
    <div className="mt-5 rounded-xl border border-stone-200 bg-white p-3 shadow-sm focus-within:border-stone-300">
      <MentionInput
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        profiles={profiles}
        placeholder="现在要做什么？@ 可以派人，回车即存"
        className="px-1 pt-0.5"
      />
      <div className="mt-2 flex items-center gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={
              'rounded-full px-2.5 py-0.5 text-xs ' +
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
          className="ml-1 rounded-full px-2 py-0.5 text-xs text-stone-400 hover:bg-stone-100"
        >
          {isGoal ? '☐ 目标' : '¶ 备忘'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="ml-auto rounded-lg bg-stone-900 px-3 py-1 text-xs text-white disabled:opacity-30"
        >
          存
        </button>
      </div>
    </div>
  )
}
