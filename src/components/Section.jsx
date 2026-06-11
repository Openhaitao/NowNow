import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { syncMentions } from '../lib/mentions'
import EntryRow from './EntryRow'
import MentionInput from './MentionInput'

export default function Section({ sec, entries, me, isMyPage, profiles, allEntries, onChanged }) {
  const [draft, setDraft] = useState('')

  const sorted = useMemo(() => {
    const list = entries.filter((e) => e.section === sec.key)
    return [
      ...list.filter((e) => e.status !== 'closed').sort((a, b) => a.position - b.position),
      ...list.filter((e) => e.status === 'closed').sort((a, b) => a.position - b.position),
    ]
  }, [entries, sec.key])

  // 幽灵输入行：回车即存。默认备忘；行首 [] = 目标。新条目落区底。
  async function add() {
    let content = draft.trim()
    if (!content) return
    let isGoal = false
    if (content.startsWith('[]')) {
      isGoal = true
      content = content.slice(2).trim()
      if (!content) return
    }
    const maxPos = Math.max(0, ...sorted.map((x) => x.position))
    const { data, error } = await supabase
      .from('entries')
      .insert({
        owner: me.id,
        creator: me.id,
        section: sec.key,
        content,
        is_goal: isGoal,
        position: maxPos + 1,
      })
      .select()
      .single()
    if (!error && data) await syncMentions(data.id, content, profiles, me.id)
    setDraft('')
    onChanged()
  }

  return (
    <section className="pt-6">
      <h3 className="mb-1 text-[13px] font-medium tracking-wide text-stone-400">{sec.label}</h3>
      {sorted.map((e) => (
        <EntryRow key={e.id} entry={e} me={me} profiles={profiles} allEntries={allEntries} onChanged={onChanged} />
      ))}
      {isMyPage && (
        <div className="flex items-start gap-2.5 py-[5px]">
          <span className="w-[15px] shrink-0" />
          <MentionInput
            value={draft}
            onChange={setDraft}
            onSubmit={add}
            profiles={profiles}
            placeholder="随便写点什么，回车即存…（行首 [] = 目标，@ 可以派人）"
          />
        </div>
      )}
      {!isMyPage && sorted.length === 0 && <p className="py-1 text-stone-200">—</p>}
    </section>
  )
}
