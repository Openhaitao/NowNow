import { useEffect, useState } from 'react'
import { searchDocs } from '../lib/docsApi'
import { periodHeaderFromKey } from '../lib/periodKey'

const SECTION_LABELS = { today: '今日', week: '本周', month: '本月', stash: '暂存箱' }

// 命中处前后截一段做片段
function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text.slice(0, 90)
  const start = Math.max(0, i - 30)
  return (start > 0 ? '…' : '') + text.slice(start, i + q.length + 60)
}

// docs 全文搜索结果：搜 doc_text，点一条跳到那个人那个频道
export default function DocSearch({ query, profiles, onJump }) {
  const [hits, setHits] = useState(null)
  useEffect(() => {
    let alive = true
    setHits(null)
    searchDocs(query)
      .then((r) => alive && setHits(r))
      .catch(() => alive && setHits([]))
    return () => {
      alive = false
    }
  }, [query])

  if (hits === null) return <div className="pt-3 text-[13px] text-stone-300">搜索中…</div>
  if (!hits.length) return <div className="pt-3 text-[13px] text-stone-300">没找到「{query}」</div>

  return (
    <div className="pt-1">
      {hits.map((h) => {
        const owner = profiles.find((p) => p.id === h.owner)
        return (
          <button
            key={h.id}
            onClick={() => onJump(h)}
            className="block w-full rounded-md px-2 py-2 text-left hover:bg-stone-50"
          >
            <div className="text-[12px] text-stone-400">
              {owner?.display_name || '某人'} · {SECTION_LABELS[h.section]}
              {h.section !== 'stash' && ` · ${periodHeaderFromKey(h.section, h.period_key)}`}
            </div>
            <div className="truncate text-[14px] text-stone-700">{snippet(h.doc_text || '', query) || '（空文档）'}</div>
          </button>
        )
      })}
    </div>
  )
}
