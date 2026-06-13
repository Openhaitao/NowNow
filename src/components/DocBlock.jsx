import { useEffect, useRef, useState } from 'react'
import DocEditor from './DocEditor'
import SaveStatus from './SaveStatus'
import { loadDocResilient, saveDocResilient, flushPending } from '../lib/resilientDocs'

// 时间线里的一个文档块 = 一个 (owner, section, period_key)。
// 当前周期可写（防抖 600ms 自动落库；永不丢字 + 离线韧性，见 resilientDocs）；过去/别人的只读。
export default function DocBlock({ owner, section, periodKey, editable, placeholder, profiles }) {
  const [content, setContent] = useState(undefined) // undefined=加载中, null=空, obj=PM JSON
  const [saveState, setSaveState] = useState(null) // 'saving'|'saved'|'offline'|'error'|null
  const saveTimer = useRef(null)
  const savedClear = useRef(null)

  // saved 低干扰：显示一下就淡出，不长驻
  const onSaveState = (s) => {
    setSaveState(s)
    clearTimeout(savedClear.current)
    if (s === 'saved') savedClear.current = setTimeout(() => setSaveState(null), 2000)
  }

  useEffect(() => {
    let alive = true
    setContent(undefined)
    loadDocResilient(owner, section, periodKey)
      .then((j) => alive && setContent(j ?? null))
      .catch(() => alive && setContent(null))
    return () => {
      alive = false
      clearTimeout(saveTimer.current)
      clearTimeout(savedClear.current)
    }
  }, [owner, section, periodKey])

  if (content === undefined) {
    return <div className="py-2 text-[13px]" style={{ color: 'var(--ink-faint)' }}>加载中…</div>
  }

  return (
    <div className="relative">
      {editable && (
        <div className="absolute right-1 top-1 z-10">
          <SaveStatus state={saveState} onRetry={() => { flushPending(); onSaveState('saving') }} />
        </div>
      )}
      <DocEditor
        content={content || undefined}
        editable={editable}
        placeholder={placeholder}
        profiles={profiles}
        uploaderId={owner}
        onChange={({ json, text }) => {
          if (!editable) return
          clearTimeout(saveTimer.current)
          saveTimer.current = setTimeout(() => {
            saveDocResilient({ owner, section, periodKey, json, text }, onSaveState)
          }, 600)
        }}
      />
    </div>
  )
}
