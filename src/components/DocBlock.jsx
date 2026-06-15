import { useEffect, useRef, useState } from 'react'
import DocEditor from './DocEditor'
import SaveStatus from './SaveStatus'
import { loadDocResilient, saveDocResilient, flushPending, peekDocCache } from '../lib/resilientDocs'

// 时间线里的一个文档块 = 一个 (owner, section, period_key)。
// 当前周期可写（防抖 600ms 自动落库；永不丢字 + 离线韧性，见 resilientDocs）；过去/别人的只读。
// fill=当前周期块铺满首屏（点空白也能落光标编辑）。
export default function DocBlock({ owner, section, periodKey, editable, placeholder, profiles, fill }) {
  // 初值同步读缓存：命中就直接拿来当初值、不经 undefined 占位 → 缓存命中零加载闪（暂存等再点秒显）。
  const [content, setContent] = useState(() => peekDocCache(owner, section, periodKey)) // undefined=加载中, null=空, obj=PM JSON
  const [saveState, setSaveState] = useState(null) // 'saving'|'saved'|'offline'|'error'|null
  const saveTimer = useRef(null)
  const savedClear = useRef(null)

  // 成功路径全静默（保存中/已保存都不显示）——海涛嫌「已保存」打扰书写。
  // 只在离线/失败时提示（永不丢字仍兜底，真出问题才出声）。
  const onSaveState = (s) => {
    clearTimeout(savedClear.current)
    setSaveState(s === 'saving' || s === 'saved' ? null : s)
  }

  useEffect(() => {
    let alive = true
    // 切块时也先用缓存（命中=不闪），miss 才回到 undefined 占位
    setContent(peekDocCache(owner, section, periodKey))
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
    // 加载中静默占位（不显示"加载中…"文字，避免开屏闪一下文案再变幽灵字）；留点高度防跳动
    return <div className="min-h-[1.75rem]" aria-hidden />
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
        fill={fill && editable}
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
